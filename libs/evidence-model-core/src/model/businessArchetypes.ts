import {
  createEmptyDomainModel,
  DomainModelDocumentSchema,
  InstantiateArchetypeInputSchema,
  type BusinessArchetypeId,
  type DomainModelDocument,
  type InstantiateArchetypeInput,
} from '@evidence-poc/evidence-schema';
import {
  createContractMutator,
  createEntityMutator,
} from '../mutations/entityMutations.js';
import {
  recordBreachOutcomeMutator,
  splitEvidenceToPairMutator,
} from '../mutations/evidenceGrowth.js';
import { linkProposalToRfpMutator } from '../mutations/businessBindings.js';
import { roleifyConfirmationMutator } from '../mutations/operators.js';
import { createRelationshipMutator } from '../mutations/relationshipMutations.js';

type PairSpec = readonly [
  requestLabel: string,
  confirmationLabel: string,
  fulfillmentAction: string,
  reverse?: true,
];
type Archetype = {
  readonly label: string;
  readonly summary: string;
  readonly channel?: readonly [inquiry: string, proposal: string];
  readonly contract: string;
  readonly primary: PairSpec;
  readonly supportingContract: string;
  readonly external: PairSpec;
  readonly socket: string;
  readonly settlement: PairSpec;
};

const archetypes = {
  'matching-escrow': {
    label: '双边撮合与担保交易',
    summary: '先询价撮合，再由独立托管协议提供到账证明，完成交付后结算。',
    channel: ['撮合询价', '匹配报价'],
    contract: '撮合交易协议',
    primary: ['请求交付', '交付确认', '交付交易标的'],
    supportingContract: '资金托管协议',
    external: ['请求托管资金', '托管到账确认', '托管交易款项'],
    socket: '担保到账凭证',
    settlement: ['主张担保结算', '担保结算确认', '结算担保交易款项'],
  },
  'periodic-subscription': {
    label: '周期订阅与会员服务',
    summary:
      '订阅协议约束每期服务交付，由独立支付协议提供扣款证明，不预设自动续费。',
    contract: '订阅框架协议',
    primary: ['请求本期服务', '本期服务交付确认', '提供本期订阅服务'],
    supportingContract: '订阅支付协议',
    external: ['请求本期扣款', '本期扣款确认', '扣收本期订阅款项'],
    socket: '订阅到账凭证',
    settlement: ['主张本期订阅费', '订阅费到账确认', '支付本期订阅费', true],
  },
  'back-to-back-consignment': {
    label: '委托代销与背靠背履约',
    summary: '销售与供货各有协议，供货验收凭证支撑交付，并保留独立的销售结算。',
    contract: '销售订单协议',
    primary: ['请求订单交付', '订单交付确认', '交付订单商品'],
    supportingContract: '委托供货协议',
    external: ['请求代发货', '代发货签收确认', '代为发运商品'],
    socket: '上游交付凭证',
    settlement: ['主张货款结算', '货款结算确认', '结算代销货款', true],
  },
} as const satisfies Record<BusinessArchetypeId, Archetype>;

const businessFields = [
  { key: 'subjectLabel', label: '核心标的物', required: true },
  { key: 'customerLabel', label: '需求方', required: true },
  { key: 'operatorLabel', label: '运营方', required: true },
  { key: 'providerLabel', label: '支撑能力提供方', required: true },
  { key: 'fulfillmentWindow', label: '主履约时限（可选）', required: false },
  { key: 'settlementBasis', label: '结算依据（可选）', required: false },
] as const;

export function getBusinessArchetype(id: BusinessArchetypeId) {
  const recipe: Archetype = archetypes[id];
  return {
    id,
    label: recipe.label,
    summary: recipe.summary,
    outline: [
      ...(recipe.channel ? [recipe.channel.join(' → ')] : []),
      `${recipe.contract}：${recipe.primary.slice(0, 2).join(' → ')}`,
      `${recipe.supportingContract}：${recipe.external.slice(0, 2).join(' → ')}（${recipe.socket}）`,
      recipe.settlement.slice(0, 2).join(' → '),
    ],
    fields: [
      ...businessFields,
      ...(id === 'periodic-subscription'
        ? [
            {
              key: 'billingCycle',
              label: '订阅计费周期（可选）',
              required: false,
            } as const,
          ]
        : []),
    ],
    optionalBranches: [
      '有确认的新权责时记录补偿；争议终点可指向主履约或已建模的补偿履约。',
    ],
  };
}

export const listBusinessArchetypes = () =>
  (Object.keys(archetypes) as BusinessArchetypeId[]).map(getBusinessArchetype);

/** Build a closed FM fragment; user text is never evaluated or put into IDs/CEL. */
function buildArchetype(input: InstantiateArchetypeInput) {
  const spec: Archetype = archetypes[input.archetypeId];
  const values = input.variationValues;
  const model = createEmptyDomainModel();
  const id = (semantic: string) => `${input.idPrefix}.${semantic}`;
  const party = (key: string, label: string) =>
    createEntityMutator(model, {
      type: 'entity',
      id: id(key),
      category: 'participant',
      kind: 'party',
      label,
    });
  const customer = party('customer', values.customerLabel);
  const operator = party('operator', values.operatorLabel);
  const provider = party('provider', values.providerLabel);
  const link = (
    key: string,
    sourceRef: string,
    targetRef: string,
    label: string,
    kind: 'references' | 'plays_role' = 'references',
  ) =>
    createRelationshipMutator(model, {
      type: 'relationship',
      id: id(key),
      sourceRef,
      targetRef,
      label,
      kind,
    });
  const contract = (
    key: string,
    label: string,
    parties: readonly [typeof customer, typeof customer],
  ) => {
    const contextRef = id(`${key}.context`);
    createEntityMutator(model, {
      type: 'entity',
      id: contextRef,
      category: 'context',
      kind: 'contract',
      label,
    });
    const bindRole = (party: typeof customer, position: 1 | 2) => {
      const roleRef = id(`${key}.party-${position}`);
      createEntityMutator(model, {
        type: 'entity',
        id: roleRef,
        category: 'role',
        kind: 'party',
        label: party.label,
        contextRef,
      });
      link(
        `${key}.bind-${position}`,
        party.id,
        roleRef,
        '参与方担任合同角色',
        'plays_role',
      );
      return roleRef;
    };
    const roles: [string, string] = [
      bindRole(parties[0], 1),
      bindRole(parties[1], 2),
    ];
    const rootRef = id(`${key}.agreement`);
    const terms =
      key === 'core'
        ? [
            values.settlementBasis && `结算依据：${values.settlementBasis}`,
            values.billingCycle && `订阅计费周期：${values.billingCycle}`,
          ].filter(Boolean)
        : [];
    createContractMutator(model, {
      type: 'entity',
      id: rootRef,
      category: 'evidence',
      kind: 'contract',
      label,
      contextRef,
      roleRefs: roles,
      attributes: [
        {
          name: 'signed_at',
          label: '签约时间',
          meaning: '协议成立的时间。',
          valueType: 'timestamp',
          timeRole: 'occurrence',
          required: true,
          keyData: true,
        },
      ],
      ...(terms.length > 0 ? { notes: terms.join('；') } : {}),
    });
    return { contextRef, roles, rootRef };
  };
  const core = contract('core', spec.contract, [customer, operator]);
  const supporting = contract('support', spec.supportingContract, [
    operator,
    provider,
  ]);
  const domainRef = id('subject.context');
  const subject = id('subject.thing');
  createEntityMutator(model, {
    type: 'entity',
    id: domainRef,
    category: 'context',
    kind: 'domain',
    label: `${values.subjectLabel}领域`,
  });
  createEntityMutator(model, {
    type: 'entity',
    id: subject,
    category: 'participant',
    kind: 'thing',
    label: values.subjectLabel,
    contextRef: domainRef,
  });

  const pair = (
    key: string,
    scope: typeof core,
    [requestLabel, confirmationLabel, fulfillmentAction, reverse]: PairSpec,
    window?: string,
  ) => {
    const confirmation = id(`${key}.confirmation`);
    const request = id(`${key}.request`);
    createEntityMutator(model, {
      type: 'entity',
      category: 'evidence',
      kind: 'other_evidence',
      contextRef: scope.contextRef,
      id: confirmation,
      label: confirmationLabel,
      attributes: [
        {
          name: 'confirmed_at',
          label: '确认时间',
          meaning: '确认凭证形成的业务时刻。',
          timeRole: 'occurrence',
          valueType: 'timestamp',
          required: true,
          keyData: true,
          source: { kind: 'result-fact' },
        },
      ],
    });
    splitEvidenceToPairMutator(model, {
      evidenceRef: confirmation,
      request: {
        mode: 'create',
        id: request,
        label: requestLabel,
        fulfillmentAction,
        responsibleRoleRef: scope.roles[reverse ? 1 : 0],
        ...(window ? { deadlineMeaning: window } : {}),
      },
      fulfillerRoleRef: scope.roles[reverse ? 0 : 1],
    });
    return { request, confirmation };
  };
  const primary = pair(
    'delivery',
    core,
    spec.primary,
    values.fulfillmentWindow,
  );
  const settlement = pair('settlement', core, spec.settlement);
  const external = pair('external', supporting, spec.external);
  link('delivery.subject', primary.request, subject, '交付标的物');
  const consumer =
    input.archetypeId === 'periodic-subscription' ? settlement : primary;
  roleifyConfirmationMutator(model, {
    targetConfirmationRef: consumer.confirmation,
    providerConfirmationRef: external.confirmation,
    socket: { mode: 'create', id: id('support.socket'), label: spec.socket },
  });
  link(
    'settlement.basis',
    settlement.request,
    primary.confirmation,
    '关联交付凭证',
  );
  if (spec.channel) {
    const channelRef = id('channel.context');
    createEntityMutator(model, {
      type: 'entity',
      id: channelRef,
      category: 'context',
      kind: 'pre_contract',
      label: '询价与报价',
      parentContextRef: core.contextRef,
    });
    const inquiryRef = id('channel.inquiry');
    const proposalRef = id('channel.proposal');
    createEntityMutator(model, {
      type: 'entity',
      id: inquiryRef,
      category: 'evidence',
      kind: 'rfp',
      label: spec.channel[0],
      contextRef: channelRef,
    });
    createEntityMutator(model, {
      type: 'entity',
      id: proposalRef,
      category: 'evidence',
      kind: 'proposal',
      label: spec.channel[1],
      contextRef: channelRef,
    });
    linkProposalToRfpMutator(model, { proposalRef, rfpRef: inquiryRef });
    link('channel.signed-from', core.rootRef, proposalRef, '签约采纳报价');
  }
  const compensationRef = id('compensation.request');
  if (values.compensation) {
    const {
      condition,
      requester,
      requestLabel,
      confirmationLabel,
      fulfillmentAction,
      window,
    } = values.compensation;
    const reverse = requester === 'operator';
    recordBreachOutcomeMutator(model, {
      requestRef: primary.request,
      condition,
      outcome: {
        kind: 'compensation_pair',
        request: {
          id: compensationRef,
          label: requestLabel,
          ...(fulfillmentAction ? { fulfillmentAction } : {}),
          responsibleRoleRef: core.roles[reverse ? 1 : 0],
          ...(window ? { deadlineMeaning: window } : {}),
        },
        confirmation: {
          id: id('compensation.confirmation'),
          label: confirmationLabel,
          responsibleRoleRef: core.roles[reverse ? 0 : 1],
          occurrence: {
            name: 'confirmed_at',
            label: '确认时间',
            meaning: '补偿结果的实际确认时间。',
          },
        },
      },
    });
  }
  if (values.remedy) {
    const targetsCompensation = values.remedy.appliesTo === 'compensation';
    recordBreachOutcomeMutator(model, {
      requestRef: targetsCompensation ? compensationRef : primary.request,
      condition: values.remedy.condition,
      outcome: {
        kind: 'terminal_escalation',
        remedyKind: values.remedy.kind,
        handoff: {
          id: id('delivery.remedy'),
          label: targetsCompensation ? '补偿履约争议移交' : '主履约争议移交',
        },
      },
    });
  }
  return { model, contextRef: core.contextRef };
}

/** Append one validated fragment without modifying existing objects. */
export function instantiateArchetypeMutator(
  draft: DomainModelDocument,
  raw: InstantiateArchetypeInput,
) {
  const input = InstantiateArchetypeInputSchema.parse(raw);
  const { billingCycle, compensation, remedy } = input.variationValues;
  if (billingCycle && input.archetypeId !== 'periodic-subscription')
    throw new Error('仅周期订阅模式可声明订阅计费周期。');
  if (!compensation && remedy?.appliesTo === 'compensation')
    throw new Error('不能为未建模的补偿履约指定争议终点。');
  const { model, contextRef } = buildArchetype(input);
  const occupied = new Set([
    draft.manifest.id,
    ...[
      ...draft.entities,
      ...draft.relationships,
      ...draft.rules,
      ...draft.stories,
    ].map(({ id }) => id),
  ]);
  const createdIds = [
    ...model.entities,
    ...model.relationships,
    ...model.rules,
  ].map(({ id }) => id);
  const collision = createdIds.find((id) => occupied.has(id));
  if (collision) throw new Error(`已存在 ${collision}，请更换实例前缀。`);
  const manifest = {
    ...draft.manifest,
    entryContextRefs: [...draft.manifest.entryContextRefs, contextRef],
  };
  const next = {
    ...draft,
    manifest,
    entities: [...draft.entities, ...model.entities],
    relationships: [...draft.relationships, ...model.relationships],
    rules: [...draft.rules, ...model.rules],
  };
  DomainModelDocumentSchema.parse(next);
  draft.manifest.entryContextRefs = manifest.entryContextRefs;
  draft.entities.push(...model.entities);
  draft.relationships.push(...model.relationships);
  draft.rules.push(...model.rules);
  return { createdIds, contextRef };
}
