import {
  computeStepHash,
  type FlowScenarioTrace,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  createEmptyDomainModel,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

export const stepFixture = (
  overrides: Partial<FlowStepTrace> = {},
): FlowStepTrace => {
  const facts = {
    sequence: 1,
    entityId: 'request.payment',
    entityKind: 'fulfillment_request' as const,
    entityLabel: '付款申请单',
    contextRef: 'context.purchase',
    storyId: 'purchase',
    stepId: 'request',
    inherited: false,
    activity: '提交',
    targetActorRef: 'role.buyer',
    actorRef: 'role.seller',
    responsibleRoleRef: 'role.buyer',
    asOf: '2026-04-01T10:00:00Z',
    basedOn: [],
    values: { amount: 100 },
    gaps: [],
    ...overrides,
  };
  return { ...facts, stepHash: computeStepHash(facts) };
};

export const flowFixture = (
  steps: readonly FlowStepTrace[] = [stepFixture()],
): FlowScenarioTrace => ({
  flowId: 'purchase',
  kind: 'primary',
  flowTitle: '采购付款',
  involvedContextRefs: ['context.purchase'],
  involvedRoleRefs: ['role.buyer', 'role.seller'],
  steps,
  traceDigest: 'not-a-cache-key',
});

export const modelFixture = (): DomainModelDocument => ({
  ...createEmptyDomainModel({
    id: 'model.purchase',
    name: '采购',
    entryContextRefs: ['context.purchase'],
  }),
  entities: [
    {
      type: 'entity',
      id: 'context.purchase',
      category: 'context',
      kind: 'contract',
      label: '采购合同',
    },
    {
      type: 'entity',
      id: 'role.seller',
      category: 'role',
      kind: 'party',
      label: '供应商销售部',
      contextRef: 'context.purchase',
    },
    {
      type: 'entity',
      id: 'role.buyer',
      category: 'role',
      kind: 'party',
      label: '买方财务部',
      contextRef: 'context.purchase',
    },
    {
      type: 'entity',
      id: 'request.payment',
      category: 'evidence',
      kind: 'fulfillment_request',
      label: '付款申请单',
      contextRef: 'context.purchase',
      attributes: [
        {
          name: 'amount',
          label: '金额',
          meaning: '应付金额',
          valueType: 'int',
          keyData: true,
        },
      ],
    },
  ],
});
