import type {
  FlowScenarioTrace,
  FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  compactCanonicalJson,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import { createStoryNarrator } from './storyNarrator.js';
import type { BusinessStoryProjection, StoryAgent } from './types.js';

const suspenseFor = (step: FlowStepTrace): string =>
  step.gaps.some((gap) => /unpaired_request|confirmation/iu.test(gap))
    ? `⚠️ 业务待决悬念：《${step.entityLabel}》尚缺对应的确认单据，请问由谁、通过何种单据、在多长期限内完成确认？`
    : `⚠️ 业务待决悬念：《${step.entityLabel}》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？`;

/** The entire playback surface is available without resolving a model or reading a narration cache. */
export const projectStoryFacts = (
  trace: FlowScenarioTrace,
  model?: DomainModelDocument,
): BusinessStoryProjection => {
  const entities = new Map(
    model?.entities.map((entity) => [entity.id, entity]),
  );
  const ordered = [...trace.steps].sort((a, b) => a.sequence - b.sequence);
  const sequences = new Set<number>();
  const scenes = ordered.map((step) => {
    if (
      !Number.isSafeInteger(step.sequence) ||
      step.sequence < 1 ||
      sequences.has(step.sequence)
    ) {
      throw new Error('Story trace requires unique positive step sequences.');
    }
    sequences.add(step.sequence);
    const attributes = new Map(
      entities
        .get(step.entityId)
        ?.attributes?.map((attribute) => [attribute.name, attribute]),
    );
    const actingRoleLabel =
      (step.actingRoleRef === undefined
        ? undefined
        : (entities.get(step.actingRoleRef)?.label ?? step.actingRoleRef)) ??
      '待明确经办方';
    const description = step.description?.trim();
    return {
      stepIndex: step.sequence,
      stepHash: step.stepHash,
      phaseTitle: `办理《${step.entityLabel}》`,
      narrative:
        description ||
        `${actingRoleLabel}办理《${step.entityLabel}》，业务时点为${step.asOf}。仅展示模型声明的事实，未执行验收或规则判定。`,
      narrativeSource: description ? ('model' as const) : ('facts' as const),
      actingRoleLabel,
      targetEntityLabel: step.entityLabel,
      documentCard: {
        title: step.entityLabel,
        fields: Object.keys(step.values)
          .sort()
          .map((name) => {
            const attribute = attributes.get(name);
            const value = step.values[name];
            return {
              name,
              label: attribute?.label ?? name,
              value:
                typeof value === 'string' ? value : compactCanonicalJson(value),
              keyData: attribute?.keyData ?? false,
            };
          }),
        ...(step.basedOn.length === 0
          ? {}
          : { basisNotes: `声明依据：${step.basedOn.join('、')}` }),
      },
      ruleEvaluations: [],
      ...(step.gaps.length === 0 ? {} : { pendingSuspense: suspenseFor(step) }),
    };
  });
  return {
    flowId: trace.flowId,
    storyTitle: trace.flowTitle,
    storySummary:
      scenes.length === 0
        ? '该业务流尚无已声明的业务步骤。'
        : `${scenes.length} 个业务环节：${scenes.map(({ phaseTitle }) => phaseTitle).join(' → ')}`,
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

/** Batch adapter for CLI export. Desktop playback uses facts and narration separately. */
export const createFlowStoryProjector = (
  options: FlowStoryProjectorOptions = {},
): FlowStoryProjector => {
  const narrator = options.skipAi ? undefined : createStoryNarrator(options);
  return {
    async project(trace, model) {
      const baseline = projectStoryFacts(trace, model);
      if (!narrator) return baseline;
      const prose = new Map<number, string>();
      const controller = new AbortController();
      let failure: Error | undefined;
      await narrator.enrich(trace, model, {
        signal: controller.signal,
        onStep: (result) => {
          if (result.kind === 'ready')
            prose.set(result.sequence, result.narrative);
          else {
            failure = result.error;
            controller.abort();
          }
        },
      });
      if (failure) throw failure;
      return {
        ...baseline,
        scenes: baseline.scenes.map((scene) => {
          const narrative = prose.get(scene.stepIndex);
          return narrative === undefined
            ? scene
            : { ...scene, narrative, narrativeSource: 'ai' };
        }),
      };
    },
  };
};
