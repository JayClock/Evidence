import {
  isContractContext,
  isEvidenceEntity,
  isFulfillmentConfirmation,
  isFulfillmentRequest,
  timeAttributeOf,
  type EntityAST,
  type RelationshipAST,
} from '@evidence-poc/evidence-schema';
import type { DomainGraph } from './graph.js';

export const HEALTH_DIMENSIONS = {
  fulfillment: '履约与异常处置',
  boundary: '领域与标的物',
  variation: '协作与变化点',
  responsibility: '权责与时标',
} as const;

type Dimension = keyof typeof HEALTH_DIMENSIONS;
type Severity = 'priority' | 'review' | 'notice';
const WEIGHT: Record<Severity, number> = { priority: 3, review: 2, notice: 1 };

type Rule = readonly [Dimension, Severity, string, string];
const RULES = {
  dead_end_request: [
    'fulfillment',
    'priority',
    '履约请求未记录异常处置',
    '请在放映中核对违约条件成立时的处置约定，也可以确认没有额外履约义务。',
  ],
  unhedged_breach_chain: [
    'fulfillment',
    'review',
    '补偿失败的处置未记录',
    '请在放映中推演这项补偿也未按约完成时的处置。',
  ],
  unpaired_fulfillment_stub: [
    'fulfillment',
    'review',
    '履约确认未关联请求',
    '这张确认证明了哪项既有主张已经满足？',
  ],
  orphan_subject_matter: [
    'boundary',
    'notice',
    '领域对象未被业务凭证引用',
    '确认它是独立的领域对象，还是某张凭证的标的物；无需为独立对象补连线。',
  ],
  missing_subject_matter: [
    'boundary',
    'notice',
    '履约对未显式关联标的物',
    '这项履约的交付对象是什么？是否需要与已有领域对象关联？',
  ],
  direct_foreign_confirmation: [
    'variation',
    'review',
    '跨合同确认存在直接引用',
    '这是固定的事实追溯，还是可能由多个提供方满足的能力？只有后者才评估角色化。',
  ],
  unbound_role_socket: [
    'variation',
    'review',
    '正在使用的凭证角色未绑定提供方',
    '哪张已知的外部凭证可满足这项业务能力？',
  ],
  vacant_responsibility: [
    'responsibility',
    'priority',
    '履约凭证责任角色未明确',
    '这份凭证代表谁的主张或交付？',
  ],
  unbound_party_role: [
    'responsibility',
    'review',
    '合同角色未关联参与方',
    '该角色由哪个已知参与方扮演？若角色由业务实例动态决定，不必虚构固定主体。',
  ],
  temporal_semantic_mismatch: [
    'responsibility',
    'notice',
    '履约时标需要澄清',
    '这是主张的开始时刻还是交付的发生时刻？只记录已确认的时标。',
  ],
} as const satisfies Record<string, Rule>;

export interface ModelHealthIssue {
  readonly id: string;
  readonly code: keyof typeof RULES;
  readonly dimension: Dimension;
  readonly severity: Severity;
  readonly title: string;
  readonly message: string;
  readonly question: string;
  readonly targetNodeId: string;
  readonly relatedNodeIds: readonly string[];
  /** Open a clarification on the evidence or rehearse the request in playback. */
  readonly inquiry?: { nodeId: string; kind: 'trace' | 'story' };
}

export interface HealthDimensionSummary {
  readonly score: number | null;
  readonly checks: number;
  readonly issueCount: number;
}

export interface ModelHealthReport {
  readonly overallScore: number | null;
  readonly dimensions: Readonly<Record<Dimension, HealthDimensionSummary>>;
  readonly issues: readonly ModelHealthIssue[];
}

const isPrimary = (edge: RelationshipAST): boolean =>
  edge.kind === 'references' && (edge.flowKind ?? 'primary') === 'primary';

/** Advisory only: the absence of a modeled fact is not a business violation. */
export const inspectModelHealth = (graph: DomainGraph): ModelHealthReport => {
  const budget = () => ({ total: 0, missed: 0, checks: 0, issueCount: 0 });
  const dimensions = {
    fulfillment: budget(),
    boundary: budget(),
    variation: budget(),
    responsibility: budget(),
  };
  const issues: ModelHealthIssue[] = [];
  const check = (
    code: ModelHealthIssue['code'],
    entity: EntityAST,
    missing: boolean,
    options: {
      ref?: string;
      related?: readonly string[];
      inquiry?: ModelHealthIssue['inquiry'];
    } = {},
  ) => {
    const [dimension, severity, title, question] = RULES[code];
    const stats = dimensions[dimension];
    const weight = WEIGHT[severity];
    stats.checks++;
    stats.total += weight;
    if (!missing) return;
    stats.issueCount++;
    stats.missed += weight;
    issues.push({
      id: `${code}:${options.ref ?? entity.id}`,
      code,
      dimension,
      severity,
      title,
      message: `「${entity.label}」：${title}。`,
      question,
      targetNodeId: entity.id,
      relatedNodeIds: options.related ?? [],
      ...(options.inquiry && { inquiry: options.inquiry }),
    });
  };
  const evidenceInContract = (entity: EntityAST | undefined) =>
    isEvidenceEntity(entity) &&
    entity.contextRef !== undefined &&
    isContractContext(graph.getEntity(entity.contextRef));
  const subjects = new Set<string>();
  const evidenceWithSubject = new Set<string>();
  for (const edge of graph.relationships()) {
    if (!isPrimary(edge)) continue;
    const host = graph.getEntity(edge.sourceRef);
    const target = graph.getEntity(edge.targetRef);
    if (
      isEvidenceEntity(host) &&
      target?.category === 'participant' &&
      target.kind === 'thing'
    ) {
      subjects.add(target.id);
      evidenceWithSubject.add(host.id);
    }
    if (
      isFulfillmentConfirmation(host) &&
      isFulfillmentConfirmation(target) &&
      evidenceInContract(host) &&
      evidenceInContract(target)
    ) {
      check(
        'direct_foreign_confirmation',
        host,
        host.contextRef !== target.contextRef,
        {
          ref: edge.id,
          related: [target.id],
          inquiry: { nodeId: host.id, kind: 'trace' },
        },
      );
    }
  }

  const linkedConfirmations = new Set<string>();
  for (const {
    request,
    confirmations,
    proofs,
    breachRules,
  } of graph.fulfillmentPairs()) {
    const trace = { inquiry: { nodeId: request.id, kind: 'trace' } } as const;
    const story = {
      inquiry: { nodeId: request.id, kind: 'story' },
    } as const;
    const hasOutcome =
      graph.breachOutcomesOf(request.id).length > 0 ||
      graph
        .incoming(request.id)
        .some(
          (edge) =>
            edge.kind === 'references' &&
            edge.flowKind === 'escalation' &&
            isEvidenceEntity(graph.getEntity(edge.sourceRef)),
        );
    const isCompensation = graph
      .outgoing(request.id)
      .some(
        (edge) =>
          edge.kind === 'references' &&
          edge.flowKind === 'breach_compensation' &&
          isFulfillmentRequest(graph.getEntity(edge.targetRef)),
      );
    if (isCompensation)
      check('unhedged_breach_chain', request, !hasOutcome, story);
    else if (timeAttributeOf(request, 'deadline') || breachRules.length)
      check('dead_end_request', request, !hasOutcome, story);
    for (const confirmation of confirmations)
      linkedConfirmations.add(confirmation.id);
    if (confirmations.length > 0 && evidenceInContract(request))
      check(
        'missing_subject_matter',
        request,
        ![request, ...confirmations, ...proofs].some(({ id }) =>
          evidenceWithSubject.has(id),
        ),
        trace,
      );
  }

  for (const entity of graph.entities()) {
    if (
      isEvidenceEntity(entity) &&
      (entity.kind === 'fulfillment_request' ||
        entity.kind === 'fulfillment_confirmation')
    ) {
      const trace = { inquiry: { nodeId: entity.id, kind: 'trace' } } as const;
      const request = entity.kind === 'fulfillment_request';
      if (!request)
        check(
          'unpaired_fulfillment_stub',
          entity,
          !linkedConfirmations.has(entity.id),
          trace,
        );
      check(
        'vacant_responsibility',
        entity,
        entity.responsibleRoleRef === undefined,
        trace,
      );
      check(
        'temporal_semantic_mismatch',
        entity,
        !timeAttributeOf(entity, request ? 'start' : 'occurrence') ||
          (request
            ? !!timeAttributeOf(entity, 'occurrence')
            : !!timeAttributeOf(entity, 'start') ||
              !!timeAttributeOf(entity, 'deadline')),
        trace,
      );
    } else if (
      entity.category === 'participant' &&
      entity.kind === 'thing' &&
      entity.domainRole === undefined
    ) {
      check('orphan_subject_matter', entity, !subjects.has(entity.id));
    } else if (entity.category === 'role') {
      const incoming = graph.incoming(entity.id);
      if (entity.kind === 'party') {
        const contract = graph.rootContractOf(entity.contextRef);
        if (!contract?.roleRefs?.includes(entity.id)) continue;
        check(
          'unbound_party_role',
          entity,
          !incoming.some((edge) => {
            const player = graph.getEntity(edge.sourceRef);
            return (
              edge.kind === 'plays_role' &&
              player?.category === 'participant' &&
              player.kind === 'party'
            );
          }),
          { inquiry: { nodeId: contract.id, kind: 'trace' } },
        );
      } else if (entity.kind === 'evidence') {
        const consumer = incoming
          .filter(isPrimary)
          .map((edge) => graph.getEntity(edge.sourceRef))
          .find(
            (host) =>
              isEvidenceEntity(host) && host.contextRef === entity.contextRef,
          );
        if (!consumer) continue;
        check(
          'unbound_role_socket',
          entity,
          !incoming.some((edge) => {
            const provider = graph.getEntity(edge.sourceRef);
            return (
              edge.kind === 'plays_role' &&
              isEvidenceEntity(provider) &&
              provider.contextRef !== undefined &&
              provider.contextRef !== entity.contextRef
            );
          }),
          {
            related: [consumer.id],
            inquiry: { nodeId: consumer.id, kind: 'trace' },
          },
        );
      }
    }
  }

  const score = (total: number, missed: number) =>
    total === 0 ? null : Math.round((100 * (total - missed)) / total);
  const summarize = ({
    total,
    missed,
    checks,
    issueCount,
  }: ReturnType<typeof budget>) => ({
    score: score(total, missed),
    checks,
    issueCount,
  });
  const stats = Object.values(dimensions);
  return {
    overallScore: score(
      stats.reduce((sum, d) => sum + d.total, 0),
      stats.reduce((sum, d) => sum + d.missed, 0),
    ),
    dimensions: {
      fulfillment: summarize(dimensions.fulfillment),
      boundary: summarize(dimensions.boundary),
      variation: summarize(dimensions.variation),
      responsibility: summarize(dimensions.responsibility),
    },
    issues: issues.sort(
      (a, b) =>
        WEIGHT[b.severity] - WEIGHT[a.severity] ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    ),
  };
};
