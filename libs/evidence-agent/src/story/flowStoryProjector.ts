import {
  createDomainGraph,
  type DomainGraph,
  type FlowScenarioTrace,
  type FlowStepTrace,
  type FulfillmentPair,
} from '@evidence-poc/evidence-model-core';
import {
  isEvidenceEntity,
  isRoleEntity,
  timeAttributeOf,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import {
  describeStoryExpectation,
  storyHistoryItem,
} from './storyContinuity.js';
import {
  buildStoryDocument,
  businessDate,
  documentReferenceOf,
} from './storyDocument.js';
import { createStoryNarrator } from './storyNarrator.js';
import type {
  BusinessStoryProjection,
  DomainActivity,
  StoryFulfillmentRequest,
  NextStepExpectation,
  StoryAgent,
  StoryScene,
  StoryStepHistoryItem,
} from './types.js';

const stepRef = (step: FlowStepTrace) => `${step.storyId}#${step.stepId}`;
const actingRole = (step: FlowStepTrace) => step.actorRef;
const uniqueRole = (refs: readonly (string | undefined)[]) => {
  const ids = new Set(refs);
  return ids.size === 1 ? ids.values().next().value : undefined;
};

const nextExpectation = (
  step: FlowStepTrace,
  successors: readonly FlowStepTrace[],
  graph: DomainGraph | undefined,
  roleLabel: (ref: string | undefined) => string | undefined,
): { expectation?: NextStepExpectation; nextRole?: string } => {
  const pair = graph?.fulfillmentPair(step.entityId);
  const observedConfirmations = successors.filter(
    (next) =>
      next.entityKind === 'fulfillment_confirmation' &&
      (!graph || pair?.confirmations.some(({ id }) => id === next.entityId)),
  );
  const confirmations =
    step.entityKind === 'fulfillment_request' ? observedConfirmations : [];
  const modeled = pair?.confirmations ?? [];
  const next =
    confirmations.length || modeled.length ? confirmations : successors;
  const missingConfirmation =
    step.entityKind === 'fulfillment_request' &&
    step.gaps.some((gap) =>
      /unpaired_request|(?:no|missing|requires?).{0,40}confirmation|confirmation.{0,40}(?:missing|required)/iu.test(
        gap,
      ),
    );
  const needsConfirmation =
    missingConfirmation && !confirmations.length && !modeled.length;
  const nextRole = needsConfirmation
    ? undefined
    : uniqueRole(
        next.length
          ? next.map(actingRole)
          : modeled.map(({ responsibleRoleRef }) => responsibleRoleRef),
      );
  const workObjects = [
    ...new Set(
      next.length
        ? next.map(({ entityLabel }) => entityLabel)
        : modeled.map(({ label }) => label),
    ),
  ];
  if (!workObjects.length && !step.gaps.length) return {};
  const entity = graph?.getEntity(step.entityId);
  const deadlineField = isEvidenceEntity(entity)
    ? timeAttributeOf(entity, 'deadline')
    : undefined;
  const deadline = deadlineField ? step.values[deadlineField.name] : undefined;
  const date =
    typeof deadline === 'string' ? businessDate(deadline) : undefined;
  const expectedWorkObject = needsConfirmation
    ? '配套确认单据'
    : workObjects.length
      ? workObjects.join('、')
      : '单据依据与责任约定';
  return {
    nextRole,
    expectation: {
      assignedToRoleLabel: roleLabel(nextRole) ?? '责任方待明确',
      expectedWorkObject,
      ...(date &&
      (confirmations.length ||
        modeled.length ||
        needsConfirmation ||
        (step.entityKind === 'rfp' &&
          next.length &&
          next.every(({ entityKind }) => entityKind === 'proposal')))
        ? { deadlineNotice: `于${date}前` }
        : {}),
      isControlGap: step.gaps.length > 0,
    },
  };
};

const activitySentence = (activity: DomainActivity) =>
  `${activity.actor.roleLabel}${activity.actionPhrase}`;

/** Project the declared scenario without a provider, clock oracle, or cache. */
export const projectStoryFacts = (
  trace: FlowScenarioTrace,
  model?: DomainModelDocument,
): BusinessStoryProjection => {
  const graph = model && createDomainGraph(model);
  const roleLabel = (ref: string | undefined): string | undefined => {
    const role = ref ? graph?.getEntity(ref) : undefined;
    return isRoleEntity(role) ? role.label : ref;
  };
  const ordered = [...trace.steps].sort((a, b) => a.sequence - b.sequence);
  const sequences = new Set<number>();
  const exact = new Map<string, FlowStepTrace>();
  for (const step of ordered) {
    if (
      !Number.isSafeInteger(step.sequence) ||
      step.sequence < 1 ||
      sequences.has(step.sequence)
    )
      throw new Error('Story trace requires unique positive step sequences.');
    sequences.add(step.sequence);
    exact.set(stepRef(step), step);
  }
  const resolve = (ref: string) => exact.get(ref);
  const upstream = new Map<FlowStepTrace, FlowStepTrace[]>();
  const downstream = new Map<FlowStepTrace, FlowStepTrace[]>();
  for (const step of ordered) {
    const parents = new Set<FlowStepTrace>();
    for (const ref of step.basedOn) {
      const parent = resolve(ref);
      if (parent && parent.sequence < step.sequence) parents.add(parent);
    }
    upstream.set(
      step,
      [...parents].sort((a, b) => a.sequence - b.sequence),
    );
    for (const parent of parents) {
      const next = downstream.get(parent) ?? [];
      next.push(step);
      downstream.set(parent, next);
    }
  }

  const rejected = new Set(
    ordered.filter((step) => (step.expectedStatus ?? 200) >= 400),
  );
  const requestFacts = (
    step: FlowStepTrace,
    pair: FulfillmentPair | undefined,
  ): StoryFulfillmentRequest => ({
    stepIndex: step.sequence,
    action: pair?.request.fulfillmentAction,
    rightHolder: storyRole(pair?.request.responsibleRoleRef),
    obligor: storyRole(pair?.obligorRoleRef),
  });
  const storyRole = (roleId: string | undefined) => {
    const label = roleLabel(roleId);
    return roleId && label ? { roleId, roleLabel: label } : undefined;
  };
  const confirmationRequests = (step: FlowStepTrace) => {
    const pending = [...(upstream.get(step) ?? [])];
    const visited = new Set<FlowStepTrace>();
    const byRequest = new Map<string, StoryFulfillmentRequest[]>();
    while (pending.length) {
      const parent = pending.pop()!;
      if (visited.has(parent) || rejected.has(parent)) continue;
      visited.add(parent);
      pending.push(...(upstream.get(parent) ?? []));
      const pair = graph?.fulfillmentPair(parent.entityId);
      if (!pair?.confirmations.some(({ id }) => id === step.entityId)) continue;
      const instances = byRequest.get(parent.entityId) ?? [];
      instances.push(requestFacts(parent, pair));
      byRequest.set(parent.entityId, instances);
    }
    // A shared confirmation can cover multiple request types, never an ambiguous instance.
    return [...byRequest.values()]
      .flatMap((instances) => (instances.length === 1 ? instances : []))
      .sort((a, b) => a.stepIndex - b.stepIndex);
  };

  const priorScenes = new Map<number, StoryScene>();
  const scenes = ordered.map((step): StoryScene => {
    const parents = upstream.get(step) ?? [];
    const { expectation } = nextExpectation(
      step,
      (downstream.get(step) ?? []).filter((next) => !rejected.has(next)),
      graph,
      roleLabel,
    );
    const actorId = actingRole(step);
    const actor = {
      roleId: actorId ?? '',
      roleLabel: roleLabel(actorId) ?? '经办方待明确',
    };
    const fulfillment: DomainActivity['fulfillment'] =
      step.entityKind === 'fulfillment_request'
        ? {
            phase: 'request',
            requests: [
              requestFacts(step, graph?.fulfillmentPair(step.entityId)),
            ],
          }
        : step.entityKind === 'fulfillment_confirmation'
          ? { phase: 'confirmation', requests: confirmationRequests(step) }
          : undefined;
    const recipient = storyRole(step.targetActorRef);
    const rejectedExample = rejected.has(step);
    const action = `${recipient ? '向' + recipient.roleLabel : ''}${step.activity}《${step.entityLabel}》`;
    const referenceCode = documentReferenceOf(step);
    const activity: DomainActivity = {
      actor,
      actionPhrase: `${rejectedExample ? '尝试' : ''}${action}`,
      ...(fulfillment ? { fulfillment } : {}),
      workObject: {
        entityId: step.entityId,
        entityLabel: step.entityLabel,
        entityKind: step.entityKind,
        ...(referenceCode ? { referenceCode } : {}),
      },
      ...(recipient ? { recipient } : {}),
      ...(rejectedExample ? { rejectedExample: true } : {}),
    };
    const prerequisites = parents.flatMap(({ sequence }) => {
      const prior = priorScenes.get(sequence);
      if (!prior) return [];
      return [
        {
          previousStepIndex: sequence,
          fromActorLabel: prior.activity.actor.roleLabel,
          workObjectLabel: prior.activity.workObject.entityLabel,
          businessSummary: `${activitySentence(prior.activity)}${prior.activity.rejectedExample ? '（该情形预期不予受理）' : ''}`,
        },
      ];
    });
    const timing = {
      rawIso: step.asOf,
      displayDate: businessDate(step.asOf) ?? '业务时点待明确',
    };
    const preceding = prerequisites
      .map(
        ({ previousStepIndex, fromActorLabel, workObjectLabel }) =>
          `第 ${previousStepIndex} 步${fromActorLabel === '经办方待明确' ? '的' : `中${fromActorLabel}经手的`}《${workObjectLabel}》`,
      )
      .join('、');
    const headline = activitySentence(activity);
    const description = step.description?.trim();
    const prose =
      description ||
      [
        preceding && `本环节承接${preceding}。`,
        `${timing.displayDate}，${headline}${referenceCode ? `（${referenceCode}）` : ''}。${rejectedExample ? '该情形预期不予受理。' : ''}`,
        !rejectedExample &&
          expectation &&
          describeStoryExpectation(expectation),
      ]
        .filter(Boolean)
        .join('\n\n');
    const scene: StoryScene = {
      stepIndex: step.sequence,
      storyId: step.storyId,
      stepId: step.stepId,
      inherited: step.inherited,
      stepHash: step.stepHash,
      timing,
      activity,
      prerequisites,
      narrative: {
        headline,
        prose,
        status: description ? 'authored' : 'baseline',
      },
      documentCard: buildStoryDocument(step, graph, (ref) => {
        const linked = resolve(ref);
        if (!linked) return undefined;
        const code = documentReferenceOf(linked);
        return `《${linked.entityLabel}》${code && code !== ref ? `（${code}）` : ''}`;
      }),
      ...(expectation && !rejectedExample ? { expectation } : {}),
    };
    priorScenes.set(scene.stepIndex, scene);
    return scene;
  });
  return {
    flowId: trace.flowId,
    kind: trace.kind,
    forkedFrom: trace.forkedFrom,
    storyTitle: trace.flowTitle,
    storySummary:
      scenes.length === 0
        ? '该业务流尚无已声明的业务步骤。'
        : `${scenes.length} 个业务环节：${scenes.map(({ narrative }) => narrative.headline).join(' → ')}`,
    businessGoal: `逐步核对${trace.flowTitle}中的单据流转、经办责任与履约依据。`,
    scenes,
  };
};

export interface FlowStoryProjectorOptions {
  readonly skipAi?: boolean;
  readonly agent?: StoryAgent;
}

export interface FlowStoryProjector {
  project(
    trace: FlowScenarioTrace,
    model?: DomainModelDocument,
  ): Promise<BusinessStoryProjection>;
}

/** Serial accumulator for whole-story exports. Desktop playback enriches one scene at a time. */
export const createFlowStoryProjector = (
  options: FlowStoryProjectorOptions = {},
): FlowStoryProjector => {
  const narrator = options.skipAi ? undefined : createStoryNarrator(options);
  return {
    async project(trace, model) {
      const baseline = projectStoryFacts(trace, model);
      if (!narrator) return baseline;
      const history: StoryStepHistoryItem[] = [];
      const scenes: StoryScene[] = [];
      for (const scene of baseline.scenes) {
        const draft = await narrator.enrichStep(scene, history, {
          flowId: trace.flowId,
        });
        const resolved: StoryScene = draft
          ? { ...scene, narrative: { ...draft.narrative, status: 'ready' } }
          : scene;
        const item = storyHistoryItem(resolved);
        if (item) history.push(item);
        scenes.push(resolved);
      }
      return { ...baseline, scenes };
    },
  };
};
