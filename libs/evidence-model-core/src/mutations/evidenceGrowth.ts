import {
  BatchAddEvidenceInputSchema,
  RecordBreachOutcomeInputSchema,
  SplitEvidenceToPairInputSchema,
  evidenceStageOf,
  isContractEntity,
  isEvidenceEntity,
  isFulfillmentConfirmation,
  isFulfillmentRequest,
  type AssignFulfillmentContextInput,
  type AttributeAST,
  type BatchAddEvidenceInput,
  type BindKeyDataSourceInput,
  type DomainModelDocument,
  type EvidenceEntityAST,
  type RecordBreachOutcomeInput,
  type SplitEvidenceToPairInput,
  type TimeRole,
} from '@evidence-poc/evidence-schema';

import { completionExpressionFor } from '../model/fulfillmentTime.js';
import { createDomainGraph } from '../model/graph.js';
import { addAttributeMutator } from './attributeMutations.js';
import { bindDerivedRuleMutator } from './derivationMutations.js';
import { createEntityMutator } from './entityMutations.js';
import {
  bindBreachRuleMutator,
  completionRuleOf,
  linkFulfillmentConfirmationMutator,
  pairFulfillmentMutator,
} from './fulfillmentPairMutations.js';
import {
  requireAttribute,
  requireContractContext,
  requireEntity,
  requirePartyRole,
} from './guards.js';
import type { OperatorResult } from './operators.js';
import { createRelationshipMutator } from './relationshipMutations.js';
import { deleteRuleMutator } from './ruleMutations.js';

type Named = { id: string; label: string };
type Time = Pick<AttributeAST, 'name' | 'label' | 'meaning'> & {
  timeRole: TimeRole;
};

const timestamp = (time: Time): AttributeAST => ({
  ...time,
  valueType: 'timestamp',
  required: true,
  keyData: true,
});

export const batchAddEvidenceMutator = (
  draft: DomainModelDocument,
  input: BatchAddEvidenceInput,
): OperatorResult => {
  const { evidences } = BatchAddEvidenceInputSchema.parse(input);
  for (const item of evidences) {
    createEntityMutator(draft, {
      type: 'entity',
      category: 'evidence',
      kind: item.stage === 'fulfillment' ? 'other_evidence' : item.stage,
      id: item.id,
      label: item.label,
      stage: item.stage,
      ...(item.sourceSnippet === undefined
        ? {}
        : { sourceSnippet: { text: item.sourceSnippet } }),
      attributes: [
        ...(item.times ?? []).map(timestamp),
        ...(item.keyData ?? []).map((data) => ({ ...data, keyData: true })),
      ],
    });
  }
  return { createdIds: evidences.map(({ id }) => id) };
};

const setRole = (
  draft: DomainModelDocument,
  entity: EvidenceEntityAST,
  roleRef?: string,
) => {
  if (roleRef === undefined) return;
  const role = requirePartyRole(draft, roleRef);
  if (entity.contextRef !== role.contextRef) {
    throw new Error(
      `责任角色 ${roleRef} 必须属于凭证的合同上下文；归属未明确时请留空。`,
    );
  }
  if (
    entity.responsibleRoleRef !== undefined &&
    entity.responsibleRoleRef !== roleRef
  ) {
    throw new Error(`凭证 ${entity.id} 已有责任角色，不能在配对时覆盖。`);
  }
  entity.responsibleRoleRef = roleRef;
};

const addRequest = (
  draft: DomainModelDocument,
  input: Named & { deadlineMeaning?: string; responsibleRoleRef?: string },
  contextRef?: string,
): EvidenceEntityAST => {
  const entity: EvidenceEntityAST = {
    type: 'entity',
    category: 'evidence',
    kind: 'fulfillment_request',
    stage: 'fulfillment',
    id: input.id,
    label: input.label,
    ...(contextRef === undefined ? {} : { contextRef }),
    attributes: [
      {
        ...timestamp({
          name: 'started_at',
          label: '发起时间',
          meaning: '履约请求发起的业务时间。',
          timeRole: 'start',
        }),
        source: { kind: 'request-input' },
      },
    ],
  };
  if (input.deadlineMeaning !== undefined) {
    entity.attributes!.push(
      timestamp({
        name: 'expired_at',
        label: '履约截止时间',
        meaning: input.deadlineMeaning,
        timeRole: 'deadline',
      }),
    );
  }
  setRole(draft, entity, input.responsibleRoleRef);
  createEntityMutator(draft, entity);
  attachRootContract(draft, entity);
  return entity;
};

const attachRootContract = (
  draft: DomainModelDocument,
  request: EvidenceEntityAST,
) => {
  if (request.contextRef === undefined) return;
  const context = requireContractContext(draft, request.contextRef);
  const root = context.rootRefs?.[0];
  if (
    root === undefined ||
    !isContractEntity(draft.entities.find(({ id }) => id === root))
  )
    return;
  if (
    draft.relationships.some(
      (edge) =>
        edge.kind === 'references' &&
        edge.sourceRef === request.id &&
        edge.targetRef === root,
    )
  )
    return;
  createRelationshipMutator(draft, {
    type: 'relationship',
    id: `relation.${request.id}-uses-${root}`,
    kind: 'references',
    sourceRef: request.id,
    targetRef: root,
    label: '请求依据根合同',
  });
};

const addCompletionIfKnown = (
  draft: DomainModelDocument,
  request: EvidenceEntityAST,
) => {
  if (request.contextRef === undefined || completionRuleOf(draft, request.id))
    return;
  const confirmations =
    createDomainGraph(draft).fulfillmentPair(request.id)?.confirmations ?? [];
  if (
    confirmations.length !== 1 ||
    completionExpressionFor(request, confirmations[0]!) === undefined
  )
    return;
  pairFulfillmentMutator(draft, {
    requestRef: request.id,
    confirmationRef: confirmations[0]!.id,
  });
};

export const splitEvidenceToPairMutator = (
  draft: DomainModelDocument,
  candidate: SplitEvidenceToPairInput,
): OperatorResult => {
  const input = SplitEvidenceToPairInputSchema.parse(candidate);
  const confirmation = requireEntity(draft, input.evidenceRef);
  if (
    !isEvidenceEntity(confirmation) ||
    (confirmation.kind !== 'fulfillment_confirmation' &&
      confirmation.kind !== 'other_evidence') ||
    evidenceStageOf(confirmation) !== 'fulfillment'
  ) {
    throw new Error('请选择履约阶段的事实凭证或履约确认。');
  }
  if (
    draft.relationships.some(
      (edge) =>
        edge.sourceRef === confirmation.id &&
        edge.terminalRemedyKind !== undefined,
    )
  )
    throw new Error('争议移交凭证不能作为履约确认。');
  if (confirmation.contextRef !== undefined)
    requireContractContext(draft, confirmation.contextRef);
  const request =
    input.request.mode === 'create'
      ? addRequest(draft, input.request, confirmation.contextRef)
      : requireEntity(draft, input.request.ref);
  if (!isFulfillmentRequest(request))
    throw new Error('只能复用已存在的履约请求。');
  if (request.contextRef !== confirmation.contextRef)
    throw new Error('不能跨合同或只给履约对的一端分配合同。');
  if (
    draft.relationships.some(
      (edge) =>
        edge.kind === 'references' &&
        (edge.flowKind === undefined || edge.flowKind === 'primary') &&
        edge.sourceRef === confirmation.id &&
        edge.targetRef !== request.id &&
        isFulfillmentRequest(
          draft.entities.find(({ id }) => id === edge.targetRef),
        ),
    )
  ) {
    throw new Error('该确认已关联其他请求，请核对既有履约关系。');
  }
  setRole(draft, confirmation, input.fulfillerRoleRef);
  confirmation.kind = 'fulfillment_confirmation';
  confirmation.stage = 'fulfillment';
  const mapped = new Set<string>();
  for (const link of input.inputAttributes ?? []) {
    const result = requireAttribute(confirmation, link.confirmationAttribute);
    if (
      mapped.has(result.name) ||
      result.timeRole !== undefined ||
      result.derivedByRuleRef !== undefined
    ) {
      throw new Error(`不能将 ${result.name} 作为申请填报的确认字段。`);
    }
    mapped.add(result.name);
    const source = {
      kind: 'preceding-evidence',
      entityRef: request.id,
      attribute: link.requestAttribute,
    } as const;
    if (
      result.source !== undefined &&
      (!('entityRef' in result.source) ||
        result.source.kind !== source.kind ||
        result.source.entityRef !== source.entityRef ||
        result.source.attribute !== source.attribute)
    ) {
      throw new Error(`字段 ${result.name} 已有来源，请先澄清冲突。`);
    }
    const existing = request.attributes?.find(
      ({ name }) => name === link.requestAttribute,
    );
    if (existing === undefined) {
      addAttributeMutator(draft, request.id, {
        name: link.requestAttribute,
        label: result.label,
        meaning: `申请人填报：${result.meaning}`,
        ...(result.valueType === undefined
          ? {}
          : { valueType: result.valueType }),
        keyData: true,
        source: { kind: 'request-input' },
      });
    } else if (
      existing.timeRole !== undefined ||
      existing.derivedByRuleRef !== undefined ||
      (existing.source !== undefined &&
        existing.source.kind !== 'request-input')
    ) {
      throw new Error(`请求字段 ${existing.name} 不是申请人填报项。`);
    } else {
      existing.source = { kind: 'request-input' };
      existing.keyData = true;
    }
    result.source = source;
    result.keyData = true;
  }
  linkFulfillmentConfirmationMutator(draft, request, confirmation);
  attachRootContract(draft, request);
  addCompletionIfKnown(draft, request);
  return { createdIds: input.request.mode === 'create' ? [request.id] : [] };
};

export const bindKeyDataSourceMutator = (
  draft: DomainModelDocument,
  input: BindKeyDataSourceInput,
): OperatorResult => {
  const host = requireEntity(draft, input.evidenceRef);
  if (!isEvidenceEntity(host)) throw new Error('请选择凭证上的关键数据项。');
  const attribute = requireAttribute(host, input.attribute);
  if (attribute.derivedByRuleRef !== undefined) {
    deleteRuleMutator(draft, attribute.derivedByRuleRef, { cascade: true });
  }
  attribute.keyData = true;
  delete attribute.source;
  if (input.decision.kind === 'direct')
    attribute.source = input.decision.source;
  if (input.decision.kind === 'derived') {
    const rule = bindDerivedRuleMutator(draft, {
      entityRef: host.id,
      attribute: attribute.name,
      rule: input.decision.rule,
    });
    return { createdIds: [rule.id] };
  }
  return { createdIds: [] };
};

export const recordBreachOutcomeMutator = (
  draft: DomainModelDocument,
  input: RecordBreachOutcomeInput,
): OperatorResult => {
  const { requestRef, condition, outcome, breachRule } =
    RecordBreachOutcomeInputSchema.parse(input);
  const original = requireEntity(draft, requestRef);
  if (!isFulfillmentRequest(original)) throw new Error('请选择原履约请求。');
  const { contextRef } = original;
  if (
    draft.relationships.some(
      (edge) =>
        (edge.flowKind === 'breach_compensation' ||
          edge.terminalRemedyKind !== undefined) &&
        edge.targetRef === requestRef &&
        edge.notes?.trim() === condition,
    )
  ) {
    throw new Error('这个触发条件已有处理分支，请在现有分支继续澄清。');
  }
  const ruleIds =
    breachRule === undefined
      ? []
      : [
          bindBreachRuleMutator(draft, {
            requestRef,
            rule: { ...breachRule, resultType: 'bool' },
          }).id,
        ];
  if (outcome.kind === 'terminal_escalation') {
    const { handoff } = outcome;
    const evidence: EvidenceEntityAST = {
      type: 'entity',
      category: 'evidence',
      kind: 'other_evidence',
      id: handoff.id,
      label: handoff.label,
      ...(contextRef === undefined ? {} : { contextRef }),
    };
    setRole(draft, evidence, handoff.responsibleRoleRef);
    createEntityMutator(draft, evidence);
    const edge = createRelationshipMutator(draft, {
      type: 'relationship',
      id: `relation.${handoff.id}-escalates-${requestRef}`,
      kind: 'references',
      flowKind: 'escalation',
      terminalRemedyKind: outcome.remedyKind,
      sourceRef: handoff.id,
      targetRef: requestRef,
      label: '移交争议处理',
      notes: condition,
    });
    return { createdIds: [...ruleIds, evidence.id, edge.id] };
  }
  const request = addRequest(draft, outcome.request, contextRef);
  const confirmation: EvidenceEntityAST = {
    type: 'entity',
    category: 'evidence',
    kind: 'fulfillment_confirmation',
    stage: 'fulfillment',
    id: outcome.confirmation.id,
    label: outcome.confirmation.label,
    ...(contextRef === undefined ? {} : { contextRef }),
    attributes: [
      ...(outcome.confirmation.occurrence === undefined
        ? []
        : [
            {
              ...timestamp({
                ...outcome.confirmation.occurrence,
                timeRole: 'occurrence',
              }),
              source: { kind: 'result-fact' as const },
            },
          ]),
      ...(outcome.confirmation.keyData ?? []).map((field) => ({
        ...field,
        keyData: true,
      })),
    ],
  };
  setRole(draft, confirmation, outcome.confirmation.responsibleRoleRef);
  createEntityMutator(draft, confirmation);
  linkFulfillmentConfirmationMutator(draft, request, confirmation);
  addCompletionIfKnown(draft, request);
  const edge = createRelationshipMutator(draft, {
    type: 'relationship',
    id: `relation.${request.id}-compensates-${requestRef}`,
    kind: 'references',
    flowKind: 'breach_compensation',
    sourceRef: request.id,
    targetRef: requestRef,
    label: '补偿原履约请求',
    notes: condition,
  });
  return { createdIds: [...ruleIds, request.id, confirmation.id, edge.id] };
};

export const assignFulfillmentContextMutator = (
  draft: DomainModelDocument,
  input: AssignFulfillmentContextInput,
): OperatorResult => {
  requireContractContext(draft, input.contextRef);
  if (!isFulfillmentRequest(requireEntity(draft, input.requestRef)))
    throw new Error('请选择履约请求。');
  const entities = new Map(
    draft.entities
      .filter(isEvidenceEntity)
      .map((entity) => [entity.id, entity]),
  );
  const neighbors = new Map<string, string[]>();
  for (const edge of draft.relationships) {
    if (edge.kind !== 'references') continue;
    const source = entities.get(edge.sourceRef);
    const target = entities.get(edge.targetRef);
    if (
      !isFulfillmentRequest(target) ||
      source === undefined ||
      !(
        (isFulfillmentConfirmation(source) &&
          (edge.flowKind === undefined || edge.flowKind === 'primary')) ||
        (isFulfillmentRequest(source) &&
          edge.flowKind === 'breach_compensation') ||
        edge.terminalRemedyKind !== undefined
      )
    )
      continue;
    for (const [from, to] of [
      [source.id, target.id],
      [target.id, source.id],
    ] as const) {
      const list = neighbors.get(from) ?? [];
      list.push(to);
      neighbors.set(from, list);
    }
  }
  const related = new Set([input.requestRef]);
  for (const ref of related) {
    for (const neighbor of neighbors.get(ref) ?? []) related.add(neighbor);
    const entity = entities.get(ref)!;
    if (
      entity.contextRef !== undefined &&
      entity.contextRef !== input.contextRef
    ) {
      throw new Error(`凭证 ${entity.id} 已归属另一份合同，不能单边迁移。`);
    }
  }
  for (const ref of related) entities.get(ref)!.contextRef = input.contextRef;
  for (const ref of related) {
    const entity = entities.get(ref)!;
    if (!isFulfillmentRequest(entity)) continue;
    attachRootContract(draft, entity);
    addCompletionIfKnown(draft, entity);
  }
  return { createdIds: [] };
};
