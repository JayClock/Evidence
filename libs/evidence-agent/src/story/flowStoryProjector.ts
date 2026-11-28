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

const exampleRef = (step: FlowStepTrace) =>
  `${step.entityId}#${step.exampleLabel}`;
// Only the example declares who acted. A request's responsibility names its right holder.
const actingRole = (step: FlowStepTrace) => step.actingRoleRef;
const uniqueRole = (refs: readonly (string | undefined)[]) => {
  const ids = new Set(refs);
  return ids.size === 1 ? ids.values().next().value : undefined;
};

const documentAction = (
  step: FlowStepTrace,
  graph: DomainGraph | undefined,
  recipient: string | undefined,
  workObject: string,
): string => {
  if (step.entityKind === 'contract')
    return `${recipient ? `与${recipient}` : ''}签署${workObject}`;
  const to = recipient ? `向${recipient}` : '';
  if (step.entityKind === 'rfp') return `${to}发出${workObject}`;
  if (step.entityKind === 'proposal') return `${to}提交${workObject}`;
  if (
    graph
      ?.outgoing(step.entityId)
      .some(
        ({ kind, flowKind, terminalRemedyKind }) =>
          kind === 'references' &&
          flowKind === 'escalation' &&
          terminalRemedyKind,
      )
  )
    return `以${workObject}提请争议处理`;
  return `记录${workObject}`;
};

const fulfillmentAction = (
  fulfillment: NonNullable<DomainActivity['fulfillment']>,
  recipient: string | undefined,
  workObject: string,
): string => {
  const actions = [
    ...new Set(fulfillment.requests.map(({ action }) => action)),
  ];
  if (fulfillment.phase === 'request') {
    const obligor = recipient ?? '义务方（待明确）';
    const action = actions[0];
    return action
      ? `要求${obligor}${action}（${workObject}）`
      : `发起履约主张（${workObject}；履约动作待明确）`;
  }
  if (!actions.length) return `记录${workObject}（关联请求未明确）`;
  if (actions.includes(undefined)) return `记录${workObject}（履约动作待明确）`;
  return `记录「${actions.join('、')}」的履约确认（${workObject}）`;
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
    return isRoleEntity(role) ? role.label : undefined;
  };
  const ordered = [...trace.steps].sort((a, b) => a.sequence - b.sequence);
  const sequences = new Set<number>();
  const exact = new Map<string, FlowStepTrace>();
  const aliases = new Map<string, FlowStepTrace | null>();
  for (const step of ordered) {
    if (
      !Number.isSafeInteger(step.sequence) ||
      step.sequence < 1 ||
      sequences.has(step.sequence)
    )
      throw new Error('Story trace requires unique positive step sequences.');
    sequences.add(step.sequence);
    exact.set(exampleRef(step), step);
    for (const alias of new Set([step.values.id, step.values.ref])) {
      if (typeof alias === 'string' && alias)
        aliases.set(alias, aliases.has(alias) ? null : step);
    }
  }
  const resolve = (ref: string) =>
    exact.get(ref) ?? aliases.get(ref) ?? undefined;
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
    ordered.filter(
      (step) =>
        (graph
          ?.getEntity(step.entityId)
          ?.examples?.find(({ label }) => label === step.exampleLabel)?.test
          ?.expectedStatus ?? 200) >= 400,
    ),
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
    const { nextRole, expectation } = nextExpectation(
      step,
      (downstream.get(step) ?? []).filter((next) => !rejected.has(next)),
      graph,
      roleLabel,
    );
    const entity = graph?.getEntity(step.entityId);
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
    const recipientId = fulfillment
      ? fulfillment.phase === 'request'
        ? fulfillment.requests[0]?.obligor?.roleId
        : uniqueRole(
            fulfillment.requests.map(({ rightHolder }) => rightHolder?.roleId),
          )
      : step.entityKind === 'proposal'
        ? uniqueRole(
            parents
              .filter(({ entityKind }) => entityKind === 'rfp')
              .map(actingRole),
          )
        : step.entityKind === 'contract' && isEvidenceEntity(entity)
          ? uniqueRole(
              (entity.roleRefs ?? []).filter((role) => role !== actorId),
            )
          : nextRole;
    const recipient =
      recipientId !== actorId ? storyRole(recipientId) : undefined;
    const rejectedExample = rejected.has(step);
    const workObject = `《${step.entityLabel}》`;
    const action = fulfillment
      ? fulfillmentAction(
          fulfillment,
          fulfillment.requests[0]?.obligor?.roleLabel,
          workObject,
        )
      : documentAction(step, graph, recipient?.roleLabel, workObject);
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
