import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';
import type {
  StoryProjectResult,
  StorySnapshot,
} from '@evidence-poc/desktop-contracts/story';
import { createDesktopFixture } from './modelFixture.js';

export const storyFlow = (flowId = '采购履约流'): FlowScenarioTrace => ({
  flowId,
  flowTitle: flowId,
  traceDigest: 'trace-1',
  involvedContextRefs: ['context.procurement'],
  involvedRoleRefs: ['role.buyer'],
  steps: (
    [
      ['evidence.contract', '采购协议', 'contract'],
      ['evidence.request', '交付请求', 'fulfillment_request'],
      ['evidence.confirmation', '交付确认', 'fulfillment_confirmation'],
    ] as const
  ).map(([entityId, entityLabel, entityKind], index) => ({
    entityId,
    entityLabel,
    entityKind,
    sequence: index + 1,
    stepHash: `step-${index}`,
    exampleLabel: `example-${index}`,
    asOf: '2026-11-11T08:00:00Z',
    values: { amount: 500 },
    gaps: index === 1 ? ['待补确认责任'] : [],
    basedOn:
      index === 0
        ? []
        : [
            `${index === 1 ? 'evidence.contract' : 'evidence.request'}#example-${index - 1}`,
          ],
  })),
});

export const createDesktopStoryFixture = () => {
  const document = createDesktopFixture();
  const flow = storyFlow();
  for (const entity of document.entities) {
    const step = flow.steps.find(({ entityId }) => entityId === entity.id);
    if (step === undefined) continue;
    entity.examples = [
      {
        label: step.exampleLabel,
        value: step.values,
        test: {
          flow: flow.flowId,
          actingRoleRef:
            entity.id === 'evidence.request' ? 'role.supplier' : 'role.buyer',
          asOf: step.asOf,
          basedOn: [...step.basedOn],
        },
      },
    ];
  }
  return document;
};

export const storySnapshot = (
  flows: readonly FlowScenarioTrace[] = [storyFlow()],
  preferredFlowId?: string,
): StorySnapshot => {
  const selected =
    flows.find(({ flowId }) => flowId === preferredFlowId) ?? flows[0];
  return {
    snapshotId: globalThis.crypto.randomUUID(),
    flows,
    ...(selected ? { selected: storyResult(selected) } : {}),
  };
};

const storyResult = (flow = storyFlow()): StoryProjectResult => ({
  flow,
  projection: {
    flowId: flow.flowId,
    storyTitle: flow.flowTitle,
    storySummary: '从采购协议到交付确认',
    businessGoal: '核对单据流转',
    scenes: flow.steps.map((step) => ({
      stepIndex: step.sequence,
      stepHash: step.stepHash,
      phaseTitle: `办理${step.entityLabel}`,
      narrative: step.description ?? `采购方办理${step.entityLabel}。`,
      narrativeSource: step.description ? 'model' : 'facts',
      actingRoleLabel: '采购方',
      targetEntityLabel: step.entityLabel,
      documentCard: {
        title: step.entityLabel,
        fields: [
          { name: 'amount', label: '金额', value: '500', keyData: true },
        ],
      },
      ruleEvaluations: [],
      ...(step.gaps.length ? { pendingSuspense: '请问谁负责确认？' } : {}),
    })),
  },
});
