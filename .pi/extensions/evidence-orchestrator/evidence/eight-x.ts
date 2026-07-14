import type { ConfirmedModelingProfile } from '../workflow/types';

export interface EightXModelSource {
  path: string;
  content: string;
}

interface EightXEntity {
  id: string;
  type: string;
  subType: string;
  parent?: string;
  contextKind?: string;
  timeConstraint?: string;
  timeoutOutcome?: string;
  participantAndThingNotApplicable?: boolean;
}

interface EightXAssociation {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  crossContext?: boolean;
  evidenceRole?: string;
}

function field(content: string, key: string): string | undefined {
  return new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm')
    .exec(content)?.[1]
    ?.replace(/^['"]|['"]$/g, '');
}

function boolField(content: string, key: string): boolean | undefined {
  const value = field(content, key);
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseModel(sources: EightXModelSource[]): {
  entities: EightXEntity[];
  associations: EightXAssociation[];
} {
  const entities = sources
    .filter(({ path }) => path.startsWith('.evidence/entities/'))
    .map(({ path, content }) => {
      const id = field(content, 'id');
      if (!id) throw new Error(`8X 模型实体缺少稳定 id：${path}。`);
      return {
        id,
        type: field(content, 'type') ?? '',
        subType: field(content, 'subType') ?? '',
        ...(field(content, 'parent')
          ? { parent: field(content, 'parent') }
          : {}),
        ...(field(content, 'contextKind')
          ? { contextKind: field(content, 'contextKind') }
          : {}),
        ...(field(content, 'timeConstraint')
          ? { timeConstraint: field(content, 'timeConstraint') }
          : {}),
        ...(field(content, 'timeoutOutcome')
          ? { timeoutOutcome: field(content, 'timeoutOutcome') }
          : {}),
        ...(boolField(content, 'participantAndThingNotApplicable') !== undefined
          ? {
              participantAndThingNotApplicable: boolField(
                content,
                'participantAndThingNotApplicable',
              ),
            }
          : {}),
      } satisfies EightXEntity;
    });
  const associations = sources
    .filter(({ path }) => path.startsWith('.evidence/associations/'))
    .map(({ path, content }) => {
      const id = field(content, 'id');
      const source = field(content, 'source');
      const target = field(content, 'target');
      if (!id || !source || !target) {
        throw new Error(`8X 模型关系缺少 id/source/target：${path}。`);
      }
      return {
        id,
        source,
        target,
        relationshipType:
          field(content, 'relationshipType') ?? field(content, 'kind') ?? '',
        ...(boolField(content, 'crossContext') !== undefined
          ? { crossContext: boolField(content, 'crossContext') }
          : {}),
        ...(field(content, 'evidenceRole')
          ? { evidenceRole: field(content, 'evidenceRole') }
          : {}),
      } satisfies EightXAssociation;
    });
  return { entities, associations };
}

function connected(
  association: EightXAssociation,
  left: string,
  right: string,
): boolean {
  return (
    (association.source === left && association.target === right) ||
    (association.source === right && association.target === left)
  );
}

function entityById(entities: EightXEntity[]): Map<string, EightXEntity> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

/** Return business-language 8X violations. Non-8X Profiles intentionally skip all rules. */
export function eightXValidationIssues(
  profile: Pick<ConfirmedModelingProfile, 'subject' | 'method'>,
  sources: EightXModelSource[],
): string[] {
  if (profile.subject !== 'business' || profile.method !== 'eight_x_flow') {
    return [];
  }
  const { entities, associations } = parseModel(sources);
  const byId = entityById(entities);
  const contexts = new Map(
    entities
      .filter((entity) => entity.type === 'CONTEXT')
      .map((entity) => [entity.id, entity]),
  );
  const issues: string[] = [];
  const requests = entities.filter(
    (entity) => entity.subType === 'fulfillment_request',
  );
  const confirmations = entities.filter(
    (entity) => entity.subType === 'fulfillment_confirmation',
  );
  const contracts = entities.filter((entity) => entity.subType === 'contract');
  const rfps = entities.filter((entity) => entity.subType === 'rfp');
  const proposals = entities.filter((entity) => entity.subType === 'proposal');
  if (
    contracts.length === 0 &&
    requests.length === 0 &&
    confirmations.length === 0 &&
    rfps.length === 0 &&
    proposals.length === 0
  ) {
    issues.push(
      'business/eight_x_flow 模型至少需要表达合同前证据、合同或履约 Request-Confirmation 中的一类业务承诺。',
    );
  }

  for (const request of requests) {
    const context = request.parent ? contexts.get(request.parent) : undefined;
    if (
      !context ||
      !['contract', 'fulfillment'].includes(context.contextKind ?? '')
    ) {
      issues.push(
        `履约请求 ${request.id} 必须属于 contextKind=contract 或 fulfillment 的明确业务上下文。`,
      );
    }
    if (!request.timeConstraint) {
      issues.push(
        `履约请求 ${request.id} 必须声明业务履约时限 timeConstraint。`,
      );
    }
    if (
      !request.timeoutOutcome ||
      !['breach', 'compensation', 'manual_review'].includes(
        request.timeoutOutcome,
      )
    ) {
      issues.push(
        `履约请求 ${request.id} 必须用 breach、compensation 或 manual_review 表达超时业务结果，不能用技术重试替代。`,
      );
    }
  }

  for (const confirmation of confirmations) {
    const context = confirmation.parent
      ? contexts.get(confirmation.parent)
      : undefined;
    if (
      !context ||
      !['contract', 'fulfillment'].includes(context.contextKind ?? '')
    ) {
      issues.push(
        `履约确认 ${confirmation.id} 必须属于 contextKind=contract 或 fulfillment 的明确业务上下文。`,
      );
    }
    const links = associations.filter(
      (association) =>
        association.relationshipType === 'confirms_request' &&
        requests.some((request) =>
          connected(association, confirmation.id, request.id),
        ),
    );
    if (links.length === 0) {
      issues.push(
        `履约确认 ${confirmation.id} 必须通过 relationshipType=confirms_request 追溯到对应履约请求。`,
      );
    }
    for (const link of links) {
      const requestId =
        link.source === confirmation.id ? link.target : link.source;
      const request = byId.get(requestId);
      if (request?.parent && request.parent !== confirmation.parent) {
        if (
          link.crossContext !== true ||
          link.evidenceRole !== 'fulfillment_confirmation'
        ) {
          issues.push(
            `跨上下文履约确认 ${confirmation.id} 必须显式声明 crossContext=true 且 evidenceRole=fulfillment_confirmation。`,
          );
        }
      }
    }
  }

  for (const contract of contracts) {
    const context = contract.parent ? contexts.get(contract.parent) : undefined;
    if (!context || context.contextKind !== 'contract') {
      issues.push(
        `合同 ${contract.id} 必须属于 contextKind=contract 的合同上下文。`,
      );
    }
    if (contract.participantAndThingNotApplicable) continue;
    const linked = associations
      .filter((association) =>
        [association.source, association.target].includes(contract.id),
      )
      .map((association) => ({
        association,
        other: byId.get(
          association.source === contract.id
            ? association.target
            : association.source,
        ),
      }));
    const hasRole = linked.some(
      ({ association, other }) =>
        association.relationshipType === 'governed_role' &&
        other?.type === 'ROLE',
    );
    const hasThing = linked.some(
      ({ association, other }) =>
        association.relationshipType === 'contract_subject' &&
        other?.type === 'PARTICIPANT' &&
        other.subType === 'thing',
    );
    if (!hasRole || !hasThing) {
      issues.push(
        `合同 ${contract.id} 必须关联 governed_role 的参与角色和 contract_subject 的标的，或明确 participantAndThingNotApplicable=true。`,
      );
    }
  }

  if (rfps.length || proposals.length) {
    const hasResponse = associations.some(
      (association) =>
        association.relationshipType === 'responds_to' &&
        proposals.some((proposal) =>
          rfps.some((rfp) => connected(association, proposal.id, rfp.id)),
        ),
    );
    const hasContractFormation = associations.some(
      (association) =>
        association.relationshipType === 'forms_contract' &&
        contracts.some((contract) =>
          proposals.some((proposal) =>
            connected(association, contract.id, proposal.id),
          ),
        ),
    );
    if (!hasResponse || !hasContractFormation) {
      issues.push(
        '合同前证据出现时，必须用 responds_to 和 forms_contract 明确 RFP → Proposal → Contract 证据链。',
      );
    }
  }

  return [...new Set(issues)].sort();
}

export function validateEightXModel(
  profile: Pick<ConfirmedModelingProfile, 'subject' | 'method'>,
  sources: EightXModelSource[],
): void {
  const issues = eightXValidationIssues(profile, sources);
  if (issues.length > 0) {
    throw new Error(`8X Flow 业务模型校验失败：${issues.join(' ')}`);
  }
}
