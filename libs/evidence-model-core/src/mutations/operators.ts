import {
  RoleifyConfirmationIntentSchema,
  isFulfillmentConfirmation,
  type AttributeAST,
  type DomainModelDocument,
  type EvidenceEntityAST,
  type DomainCalculatorIntent,
  type FulfillmentPairIntent,
  type RoleifyConfirmationIntent,
} from '@evidence-poc/evidence-schema';

export type {
  DomainCalculatorIntent,
  FulfillmentPairIntent,
  RoleifyConfirmationIntent,
} from '@evidence-poc/evidence-schema';

import type { CreateFulfillmentPairInput } from './fulfillmentMutations.js';
import { createFulfillmentPairMutator } from './fulfillmentMutations.js';
import { createEntityMutator } from './entityMutations.js';
import { createRelationshipMutator } from './relationshipMutations.js';
import { addAttributeMutator } from './attributeMutations.js';
import { bindDerivedRuleMutator } from './derivationMutations.js';
import { requireContractContext, requireEntity } from './guards.js';

export interface OperatorResult {
  createdIds: readonly string[];
}

const timestamp = (
  role: import('@evidence-poc/evidence-schema').TimeRole,
  name: string,
  label: string,
  meaning: string,
): AttributeAST => ({
  name,
  label,
  meaning,
  valueType: 'timestamp',
  required: true,
  keyData: true,
  timeRole: role,
});

const startedAt = (window: string | undefined): AttributeAST =>
  timestamp(
    'start',
    'started_at',
    '发起时间',
    window === undefined
      ? '权利方发起履约请求的业务时间。'
      : `权利方发起履约请求的业务时间；约定窗口为${window}。`,
  );

const expiredAt = (window: string | undefined): AttributeAST =>
  timestamp(
    'deadline',
    'expired_at',
    '履约截止时间',
    window === undefined
      ? '权利方要求的履约时限终点，由合同条款确定。'
      : `权利方要求的履约时限终点，取发起时间加${window}。`,
  );

const confirmedAt = (label: string): AttributeAST =>
  timestamp(
    'occurrence',
    'confirmed_at',
    '确认时间',
    `${label}形成时的业务时间。`,
  );

const createdAt = (label: string): AttributeAST =>
  timestamp(
    'occurrence',
    'created_at',
    '形成时间',
    `${label}形成时的业务时间。`,
  );

const pairInput = ({
  contextRef,
  request,
  confirmation,
  contractRef,
}: {
  contextRef: string;
  request: {
    id: string;
    label: string;
    responsibleRoleRef: string;
    window?: string;
  };
  confirmation: {
    id: string;
    label: string;
    responsibleRoleRef: string;
  };
  contractRef: string | undefined;
}): CreateFulfillmentPairInput => ({
  contextRef,
  request: {
    id: request.id,
    label: request.label,
    responsibleRoleRef: request.responsibleRoleRef,
    attributes: [startedAt(request.window), expiredAt(request.window)],
  },
  confirmation: {
    id: confirmation.id,
    label: confirmation.label,
    responsibleRoleRef: confirmation.responsibleRoleRef,
    attributes: [confirmedAt(confirmation.label)],
  },
  ...(contractRef === undefined
    ? {}
    : { contractReferenceId: `relation.${request.id}-references-contract` }),
});

const rootContractOf = (
  document: DomainModelDocument,
  contextRef: string,
): EvidenceEntityAST | undefined => {
  const context = document.entities.find((entity) => entity.id === contextRef);

  if (context === undefined || context.category !== 'context') {
    throw new Error(`未知的上下文 '${contextRef}'，无法确定履约归属。`);
  }

  const roots = (context.rootRefs ?? []).flatMap((ref) =>
    document.entities.filter(
      (entity): entity is EvidenceEntityAST =>
        entity.id === ref &&
        entity.category === 'evidence' &&
        entity.kind === 'contract',
    ),
  );

  return roots.length === 1 ? roots[0] : undefined;
};

export const introduceFulfillmentPairMutator = (
  document: DomainModelDocument,
  intent: FulfillmentPairIntent,
): OperatorResult => {
  const rootContract = rootContractOf(document, intent.contextRef);

  if (intent.proof !== undefined) {
    const proof: EvidenceEntityAST = {
      type: 'entity',
      category: 'evidence',
      kind: 'other_evidence',
      id: intent.proof.id,
      label: intent.proof.label,
      contextRef: intent.contextRef,
      responsibleRoleRef:
        intent.proof.responsibleRoleRef ??
        intent.confirmation.responsibleRoleRef,
      attributes: [createdAt(intent.proof.label)],
    };

    createEntityMutator(document, proof);
  }

  createFulfillmentPairMutator(
    document,
    pairInput({
      contextRef: intent.contextRef,
      request: intent.request,
      confirmation: intent.confirmation,
      contractRef: rootContract?.id,
    }),
  );

  if (intent.proof !== undefined) {
    createRelationshipMutator(document, {
      type: 'relationship',
      id: `relation.${intent.confirmation.id}-uses-${intent.proof.id}`,
      kind: 'references',
      sourceRef: intent.confirmation.id,
      targetRef: intent.proof.id,
      label: '确认引用履约证明',
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 1, max: 1 },
    });
  }

  return {
    createdIds: [
      ...(intent.proof === undefined ? [] : [intent.proof.id]),
      intent.request.id,
      intent.confirmation.id,
    ],
  };
};

export const roleifyConfirmationMutator = (
  document: DomainModelDocument,
  intent: RoleifyConfirmationIntent,
): OperatorResult => {
  const { targetConfirmationRef, providerConfirmationRef, socket } =
    RoleifyConfirmationIntentSchema.parse(intent);
  const target = requireEntity(document, targetConfirmationRef);
  const provider = requireEntity(document, providerConfirmationRef);
  if (
    !isFulfillmentConfirmation(target) ||
    !isFulfillmentConfirmation(provider)
  )
    throw new Error('能力角色需要两张真实的履约确认。');
  if (
    target.contextRef === undefined ||
    provider.contextRef === undefined ||
    target.contextRef === provider.contextRef
  )
    throw new Error('核心确认和提供方确认必须属于不同的合同上下文。');
  requireContractContext(document, target.contextRef);
  requireContractContext(document, provider.contextRef);

  const socketId = socket.mode === 'create' ? socket.id : socket.ref;
  const createdIds: string[] = [];
  if (socket.mode === 'create') {
    createEntityMutator(document, {
      type: 'entity',
      category: 'role',
      kind: 'evidence',
      id: socket.id,
      label: socket.label,
      contextRef: target.contextRef,
    });
    createdIds.push(socketId);
  } else {
    const role = requireEntity(document, socketId);
    if (
      role.category !== 'role' ||
      role.kind !== 'evidence' ||
      role.contextRef !== target.contextRef
    )
      throw new Error('只能复用核心合同内的凭证角色。');
  }

  const ensureLink = (
    kind: 'references' | 'plays_role',
    sourceRef: string,
    label: string,
  ) => {
    if (
      document.relationships.some(
        (edge) =>
          edge.kind === kind &&
          (edge.flowKind === undefined || edge.flowKind === 'primary') &&
          edge.sourceRef === sourceRef &&
          edge.targetRef === socketId,
      )
    )
      return;
    const edge = createRelationshipMutator(document, {
      type: 'relationship',
      id: `relation.${sourceRef}-${kind === 'references' ? 'uses' : 'plays'}-${socketId}`,
      kind,
      sourceRef,
      targetRef: socketId,
      label,
    });
    createdIds.push(edge.id);
  };
  ensureLink('references', target.id, '确认引用履约能力角色');
  ensureLink('plays_role', provider.id, '外部履约确认扮演能力角色');
  const relationships = document.relationships.filter(
    (edge) =>
      !(
        edge.kind === 'references' &&
        (edge.flowKind === undefined || edge.flowKind === 'primary') &&
        edge.sourceRef === target.id &&
        edge.targetRef === provider.id
      ),
  );
  if (relationships.length !== document.relationships.length)
    document.relationships = relationships;
  return { createdIds };
};

export const isolateDomainCalculatorMutator = (
  document: DomainModelDocument,
  intent: DomainCalculatorIntent,
): OperatorResult => {
  const host = document.entities.find(
    (entity) => entity.id === intent.host.ref,
  );

  if (host === undefined) {
    throw new Error(
      `未知的宿主对象 '${intent.host.ref}'，无法为它抽出领域计算。`,
    );
  }

  if (host.category === 'context') {
    throw new Error(`上下文 '${intent.host.ref}' 不能承载计算属性。`);
  }

  if (
    (host.attributes ?? []).some(
      (attribute) =>
        attribute.name === intent.host.attribute.name &&
        attribute.derivedByRuleRef !== undefined,
    )
  ) {
    throw new Error(
      `'${intent.host.ref}.${intent.host.attribute.name}' 已有派生规则，先用 update-attribute 解除再抽出计算。`,
    );
  }

  const createdIds: string[] = [];
  const existingContext = document.entities.find(
    (entity) => entity.id === intent.context.id,
  );

  if (existingContext === undefined) {
    createEntityMutator(document, {
      type: 'entity',
      category: 'context',
      kind: 'domain',
      id: intent.context.id,
      label: intent.context.label,
      rootRefs: [intent.calculator.id],
    });
    createdIds.push(intent.context.id);
  } else if (
    existingContext.category !== 'context' ||
    existingContext.kind !== 'domain'
  ) {
    throw new Error(
      `'${intent.context.id}' 不是领域上下文，计算不能放在那里。`,
    );
  }

  if (document.entities.some((entity) => entity.id === intent.calculator.id)) {
    throw new Error(
      `'${intent.calculator.id}' 已被占用，领域组件需要新的标识。`,
    );
  }

  createEntityMutator(document, {
    type: 'entity',
    category: 'participant',
    kind: 'thing',
    id: intent.calculator.id,
    label: intent.calculator.label,
    contextRef: intent.context.id,
    domainRole: intent.calculator.role ?? 'calculator',
    ...(intent.calculator.meaning === undefined
      ? {}
      : { notes: intent.calculator.meaning }),
    ...(intent.calculator.attributes === undefined
      ? {}
      : { attributes: intent.calculator.attributes }),
  });
  createdIds.push(intent.calculator.id);

  const hasAttribute = (host.attributes ?? []).some(
    (attribute) => attribute.name === intent.host.attribute.name,
  );

  if (!hasAttribute) {
    addAttributeMutator(document, host.id, intent.host.attribute);
    createdIds.push(`${host.id}.${intent.host.attribute.name}`);
  }

  const alias = intent.rule.alias ?? 'calculator';

  bindDerivedRuleMutator(document, {
    entityRef: host.id,
    attribute: intent.host.attribute.name,
    rule: {
      id: intent.rule.id,
      label: intent.rule.label,
      description: intent.rule.description,
      bindings: {
        [alias]: { ref: intent.calculator.id },
        [intent.hostAlias ?? 'host']: { ref: host.id },
        ...intent.bindings,
      },
      expression: intent.rule.expression,
      resultType: intent.rule.resultType,
    },
  });
  createdIds.push(intent.rule.id);

  return { createdIds };
};
