import {
  createDomainGraph,
  type DomainGraph,
  type FlowScenarioTrace,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  isEvidenceEntity,
  timeAttributeOf,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import { sanitizeDocumentTitle, storyRoleOf } from './domainSanitizer.js';
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
  DomainActionVerb,
  DomainActivity,
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

const deduceVerb = (
  step: FlowStepTrace,
  graph: DomainGraph | undefined,
): readonly [DomainActionVerb, string] => {
  const edges = graph?.outgoing(step.entityId) ?? [];
  if (
    step.entityKind === 'fulfillment_request' &&
    edges.some(
      ({ kind, flowKind }) =>
        kind === 'references' && flowKind === 'breach_compensation',
    )
  )
    return ['claim_breach', '提出违约主张'];
  if (
    edges.some(
      ({ kind, flowKind, terminalRemedyKind }) =>
        kind === 'references' &&
        flowKind === 'escalation' &&
        terminalRemedyKind,
    )
  )
    return ['escalate', '提请争议处理'];
  switch (step.entityKind) {
    case 'contract':
      return ['sign', '签署'];
    case 'rfp':
      return ['notify', '发出'];
    case 'proposal':
    case 'fulfillment_request':
      return ['submit', '提交'];
    case 'fulfillment_confirmation':
      return ['confirm', '出具'];
    default:
      return /通知|函件|notice/iu.test(step.entityLabel)
        ? ['notify', '送达']
        : ['issue', /发票|invoice/iu.test(step.entityLabel) ? '开具' : '出具'];
  }
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
      (!pair ||
        pair.confirmations.some(({ id }) => id === next.entityId) ||
        graph
          ?.outgoing(next.entityId)
          .some(
            ({ kind, targetRef }) =>
              kind === 'references' && targetRef === step.entityId,
          )),
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
        ? next.map(({ entityLabel }) => sanitizeDocumentTitle(entityLabel))
        : modeled.map(({ label }) => sanitizeDocumentTitle(label)),
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
  `${activity.actor.businessName}${activity.actionPhrase}`;

/** Project the declared scenario without a provider, clock oracle, or cache. */
export const projectStoryFacts = (
  trace: FlowScenarioTrace,
  model?: DomainModelDocument,
): BusinessStoryProjection => {
  const graph = model && createDomainGraph(model);
  const role = (ref: string | undefined) => storyRoleOf(graph, ref);
  const roleLabel = (ref: string | undefined) => role(ref)?.businessName;
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
    const actor = role(actorId) ?? {
      roleId: actorId ?? '',
      businessName: '经办方待明确',
    };
    const anchorKind =
      step.entityKind === 'proposal' ? 'rfp' : 'fulfillment_request';
    const recipientId =
      step.entityKind === 'fulfillment_confirmation' ||
      step.entityKind === 'proposal'
        ? uniqueRole(
            parents
              .filter(({ entityKind }) => entityKind === anchorKind)
              .map(actingRole),
          )
        : step.entityKind === 'contract' && isEvidenceEntity(entity)
          ? uniqueRole(
              (entity.roleRefs ?? []).filter((role) => role !== actorId),
            )
          : nextRole;
    const recipient = recipientId !== actorId ? role(recipientId) : undefined;
    const [actionVerb, verb] = deduceVerb(step, graph);
    const rejectedExample = rejected.has(step);
    const businessTitle = sanitizeDocumentTitle(step.entityLabel);
    const workObject = `《${businessTitle}》`;
    const action =
      actionVerb === 'claim_breach' || actionVerb === 'escalate'
        ? `以${workObject}${verb}`
        : `${verb}${workObject}`;
    const referenceCode = documentReferenceOf(step);
    const activity: DomainActivity = {
      actor,
      actionVerb,
      actionPhrase: `${rejectedExample ? '尝试' : ''}${recipient ? `${actionVerb === 'sign' ? '与' : '向'}${recipient.businessName}` : ''}${action}`,
      workObject: {
        entityId: step.entityId,
        entityLabel: businessTitle,
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
          fromActorLabel: prior.activity.actor.businessName,
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
        return `《${sanitizeDocumentTitle(linked.entityLabel)}》${code && code !== ref ? `（${code}）` : ''}`;
      }),
      ...(expectation && !rejectedExample ? { expectation } : {}),
      ruleEvaluations: [],
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
        const draft = await narrator.enrichStep(scene, history);
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
