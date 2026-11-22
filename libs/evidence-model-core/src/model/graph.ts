import {
  type AttributeAST,
  type ContextEntityAST,
  type DomainModelDocument,
  type EntityAST,
  type EvidenceEntityAST,
  type ParticipantEntityAST,
  type RelationshipAST,
  type RoleEntityAST,
  type RuleAST,
  type TerminalRemedyKind,
  findAttribute,
  isContextEntity,
  isContractEntity,
  isEvidenceEntity,
  isFulfillmentConfirmation,
  isFulfillmentRequest,
  isParticipantEntity,
  isRoleEntity,
} from '@evidence-poc/evidence-schema';

/** One request paired with the results and rules that decide its fulfillment. */
export interface FulfillmentPair {
  readonly request: EvidenceEntityAST;
  /** Root Contract of the request's Contract Context, when modeled. */
  readonly contract: EvidenceEntityAST | null;
  /** `fulfillment_confirmation` moments referencing the request. */
  readonly confirmations: readonly EvidenceEntityAST[];
  /** `other_evidence` moments referencing the request or its confirmations. */
  readonly proofs: readonly EvidenceEntityAST[];
  readonly completionRules: readonly RuleAST[];
  readonly breachRules: readonly RuleAST[];
}

export interface PreContractPair {
  readonly rfp: EvidenceEntityAST;
  readonly proposals: readonly EvidenceEntityAST[];
}

export type BreachOutcomeBranch =
  | {
      readonly kind: 'compensation_pair';
      readonly edge: RelationshipAST;
      readonly compensation: FulfillmentPair;
    }
  | {
      readonly kind: 'terminal_escalation';
      readonly edge: RelationshipAST;
      readonly handoff: EvidenceEntityAST;
      readonly remedyKind: TerminalRemedyKind;
    };

export interface BreachChainNode {
  readonly requestId: string;
  readonly branches: readonly BreachOutcomeBranch[];
}

export interface ClassifiedConfirmation {
  readonly entity: EvidenceEntityAST;
  readonly incomingRequests: readonly EvidenceEntityAST[];
  readonly topologyKind:
    | 'exclusive_singleton'
    | 'exclusive_collection'
    | 'shared';
}

/**
 * Read-only indexes over one immutable {@link DomainModelDocument}.
 *
 * The graph is rebuilt whenever the session document changes; every lookup is
 * O(1) for indexed objects. Fulfillment projections are derived on first use.
 */
export interface DomainGraph {
  readonly document: DomainModelDocument;
  getEntity(entityId: string): EntityAST | undefined;
  getRule(ruleId: string): RuleAST | undefined;
  getRelationship(relationshipId: string): RelationshipAST | undefined;
  entities(): readonly EntityAST[];
  rules(): readonly RuleAST[];
  relationships(): readonly RelationshipAST[];
  attributesOf(entityId: string): readonly AttributeAST[];
  attribute(entityId: string, attributeName: string): AttributeAST | undefined;
  /** Relationships pointing at or from the object. */
  outgoing(objectId: string): readonly RelationshipAST[];
  incoming(objectId: string): readonly RelationshipAST[];
  /** Distinct object ids reachable through one formal relationship. */
  relatedIds(objectId: string): readonly string[];
  /** Objects owned by one Context through `contextRef`. */
  entitiesInContext(contextId: string): readonly EntityAST[];
  childContexts(contextId: string): readonly ContextEntityAST[];
  /** Root-to-node chain, cycle safe. */
  contextPath(contextId: string): readonly ContextEntityAST[];
  /** Root Contract of a Contract Context. */
  rootContractOf(contextId: string): EvidenceEntityAST | undefined;
  rulesInContext(contextId: string): readonly RuleAST[];
  rulesReferencing(entityId: string): readonly RuleAST[];
  derivationRule(entityId: string, attributeName: string): RuleAST | undefined;
  fulfillmentPairs(): readonly FulfillmentPair[];
  fulfillmentPair(requestId: string): FulfillmentPair | undefined;
  fulfillmentConfirmations(): readonly ClassifiedConfirmation[];
  preContractPairs(): readonly PreContractPair[];
  subjectMattersOf(evidenceId: string): readonly ParticipantEntityAST[];
  socketRolesInContext(contextId: string): readonly RoleEntityAST[];
  /** Direct, explicitly modeled outcomes; an untyped escalation is not terminal. */
  breachOutcomesOf(requestId: string): readonly BreachOutcomeBranch[];
  /** Breadth-first, with each reachable request emitted once even in invalid drafts. */
  breachChainsOf(requestId: string): readonly BreachChainNode[];
}

const groupBy = <TItem>(
  items: readonly TItem[],
  key: (item: TItem) => string | undefined,
): Map<string, TItem[]> => {
  const grouped = new Map<string, TItem[]>();

  for (const item of items) {
    const group = key(item);

    if (group === undefined) {
      continue;
    }

    const bucket = grouped.get(group);

    if (bucket === undefined) {
      grouped.set(group, [item]);
    } else {
      bucket.push(item);
    }
  }

  return grouped;
};

const rulesBinding = (rule: RuleAST, objectId: string): boolean =>
  Object.values(rule.bindings).some(
    (binding) => 'ref' in binding && binding.ref === objectId,
  );

const isPrimaryReference = (edge: RelationshipAST): boolean =>
  edge.kind === 'references' &&
  (edge.flowKind === undefined || edge.flowKind === 'primary');

export function createDomainGraph(document: DomainModelDocument): DomainGraph {
  const entityById = new Map(
    document.entities.map((entity) => [entity.id, entity]),
  );
  const ruleById = new Map(document.rules.map((rule) => [rule.id, rule]));
  const relationshipById = new Map(
    document.relationships.map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  const outgoing = groupBy(
    document.relationships,
    (relationship) => relationship.sourceRef,
  );
  const incoming = groupBy(
    document.relationships,
    (relationship) => relationship.targetRef,
  );
  const inContext = groupBy(document.entities, (entity) =>
    'contextRef' in entity ? entity.contextRef : undefined,
  );
  const childContexts = groupBy(
    document.entities.filter(isContextEntity),
    (context) => context.parentContextRef,
  );

  let pairs: readonly FulfillmentPair[] | undefined;
  let pairsByRequest: Map<string, FulfillmentPair> | undefined;
  let confirmations: readonly ClassifiedConfirmation[] | undefined;
  let channelPairs: readonly PreContractPair[] | undefined;

  const rootContractOf = (contextId: string): EvidenceEntityAST | undefined => {
    const context = entityById.get(contextId);

    if (context === undefined || !isContextEntity(context)) {
      return undefined;
    }

    const contracts = (context.rootRefs ?? [])
      .map((ref) => entityById.get(ref))
      .filter(isContractEntity);

    return contracts.length === 1 ? contracts[0] : undefined;
  };

  const referencesTo = (objectId: string): readonly EntityAST[] =>
    [
      ...new Set(
        (incoming.get(objectId) ?? [])
          .filter(isPrimaryReference)
          .map((relationship) => relationship.sourceRef),
      ),
    ]
      .map((ref) => entityById.get(ref))
      .filter((entity): entity is EntityAST => entity !== undefined);

  const classifyConfirmation = (
    entity: EvidenceEntityAST,
  ): ClassifiedConfirmation => {
    const requestEdges = (outgoing.get(entity.id) ?? []).filter(
      (edge) =>
        isPrimaryReference(edge) &&
        isFulfillmentRequest(entityById.get(edge.targetRef)),
    );
    const incomingRequests = [
      ...new Set(requestEdges.map((edge) => edge.targetRef)),
    ]
      .map((ref) => entityById.get(ref))
      .filter(isFulfillmentRequest);
    const shared =
      incomingRequests.length > 1 ||
      requestEdges.some(
        (edge) =>
          edge.targetCardinality !== undefined &&
          edge.targetCardinality.max !== 1,
      );
    const singleton =
      requestEdges.length > 0 &&
      requestEdges.every((edge) => edge.sourceCardinality?.max === 1);
    return {
      entity,
      incomingRequests,
      topologyKind: shared
        ? 'shared'
        : singleton
          ? 'exclusive_singleton'
          : 'exclusive_collection',
    };
  };

  const buildPair = (request: EvidenceEntityAST): FulfillmentPair => {
    const confirmations = referencesTo(request.id).filter(
      isFulfillmentConfirmation,
    );
    const proofSources = [request.id, ...confirmations.map(({ id }) => id)];
    const proofs = proofSources
      .flatMap((sourceId) => referencesTo(sourceId))
      .filter(
        (entity): entity is EvidenceEntityAST =>
          isEvidenceEntity(entity) && entity.kind === 'other_evidence',
      )
      .filter(
        (entity, index, list) =>
          list.findIndex((candidate) => candidate.id === entity.id) === index,
      );

    return {
      request,
      contract:
        request.contextRef === undefined
          ? null
          : (rootContractOf(request.contextRef) ?? null),
      confirmations,
      proofs,
      completionRules: document.rules.filter(
        (rule) => rule.kind === 'completion' && rulesBinding(rule, request.id),
      ),
      breachRules: document.rules.filter(
        (rule) => rule.kind === 'breach' && rulesBinding(rule, request.id),
      ),
    };
  };

  const ensurePairs = (): readonly FulfillmentPair[] => {
    if (pairs === undefined) {
      pairs = document.entities.filter(isFulfillmentRequest).map(buildPair);
      pairsByRequest = new Map(
        pairs.map((pair) => [pair.request.id, pair] as const),
      );
    }

    return pairs;
  };

  const fulfillmentPair = (requestId: string): FulfillmentPair | undefined => {
    ensurePairs();
    return pairsByRequest?.get(requestId);
  };

  const breachOutcomesOf = (
    requestId: string,
  ): readonly BreachOutcomeBranch[] => {
    if (!isFulfillmentRequest(entityById.get(requestId))) return [];
    const branches: BreachOutcomeBranch[] = [];
    for (const edge of incoming.get(requestId) ?? []) {
      if (edge.kind !== 'references') continue;
      if (edge.flowKind === 'breach_compensation') {
        const compensation = fulfillmentPair(edge.sourceRef);
        if (compensation !== undefined)
          branches.push({ kind: 'compensation_pair', edge, compensation });
      } else if (
        edge.flowKind === 'escalation' &&
        edge.terminalRemedyKind !== undefined
      ) {
        const handoff = entityById.get(edge.sourceRef);
        if (isEvidenceEntity(handoff) && handoff.kind === 'other_evidence')
          branches.push({
            kind: 'terminal_escalation',
            edge,
            handoff,
            remedyKind: edge.terminalRemedyKind,
          });
      }
    }
    return branches;
  };

  return {
    document,
    getEntity: (entityId) => entityById.get(entityId),
    getRule: (ruleId) => ruleById.get(ruleId),
    getRelationship: (relationshipId) => relationshipById.get(relationshipId),
    entities: () => document.entities,
    rules: () => document.rules,
    relationships: () => document.relationships,
    attributesOf: (entityId) => entityById.get(entityId)?.attributes ?? [],
    attribute: (entityId, attributeName) =>
      findAttribute(entityById.get(entityId), attributeName),
    outgoing: (objectId) => outgoing.get(objectId) ?? [],
    incoming: (objectId) => incoming.get(objectId) ?? [],
    relatedIds: (objectId) => {
      const related = new Set<string>();

      for (const relationship of [
        ...(outgoing.get(objectId) ?? []),
        ...(incoming.get(objectId) ?? []),
      ]) {
        related.add(
          relationship.sourceRef === objectId
            ? relationship.targetRef
            : relationship.sourceRef,
        );
      }

      return [...related];
    },
    entitiesInContext: (contextId) => inContext.get(contextId) ?? [],
    childContexts: (contextId) => childContexts.get(contextId) ?? [],
    contextPath: (contextId) => {
      const path: ContextEntityAST[] = [];
      const seen = new Set<string>();
      let current = entityById.get(contextId);

      while (
        current !== undefined &&
        isContextEntity(current) &&
        !seen.has(current.id)
      ) {
        seen.add(current.id);
        path.unshift(current);
        current =
          current.parentContextRef === undefined
            ? undefined
            : entityById.get(current.parentContextRef);
      }

      return path;
    },
    rootContractOf,
    rulesInContext: (contextId) =>
      document.rules.filter((rule) => rule.contextRef === contextId),
    rulesReferencing: (entityId) =>
      document.rules.filter((rule) => rulesBinding(rule, entityId)),
    derivationRule: (entityId, attributeName) => {
      const ruleRef = findAttribute(
        entityById.get(entityId),
        attributeName,
      )?.derivedByRuleRef;

      return ruleRef === undefined ? undefined : ruleById.get(ruleRef);
    },
    fulfillmentPairs: ensurePairs,
    fulfillmentConfirmations: () =>
      (confirmations ??= document.entities
        .filter(isFulfillmentConfirmation)
        .map(classifyConfirmation)),
    fulfillmentPair,
    preContractPairs: () =>
      (channelPairs ??= document.entities.flatMap((rfp) => {
        if (!isEvidenceEntity(rfp) || rfp.kind !== 'rfp') return [];
        const proposals = referencesTo(rfp.id).filter(
          (entity): entity is EvidenceEntityAST =>
            isEvidenceEntity(entity) &&
            entity.kind === 'proposal' &&
            entity.contextRef === rfp.contextRef,
        );
        return proposals.length > 0 ? [{ rfp, proposals }] : [];
      })),
    subjectMattersOf: (evidenceId) => {
      if (!isEvidenceEntity(entityById.get(evidenceId))) return [];
      return [
        ...new Set(
          (outgoing.get(evidenceId) ?? [])
            .filter(isPrimaryReference)
            .map((edge) => edge.targetRef),
        ),
      ]
        .map((id) => entityById.get(id))
        .filter(
          (entity): entity is ParticipantEntityAST =>
            isParticipantEntity(entity) && entity.kind === 'thing',
        );
    },
    socketRolesInContext: (contextId) =>
      (inContext.get(contextId) ?? []).filter(
        (entity): entity is RoleEntityAST =>
          isRoleEntity(entity) && entity.kind === 'evidence',
      ),
    breachOutcomesOf,
    breachChainsOf: (requestId) => {
      if (!isFulfillmentRequest(entityById.get(requestId))) return [];
      const seen = new Set([requestId]);
      const nodes: BreachChainNode[] = [];
      for (const id of seen) {
        const branches = breachOutcomesOf(id);
        nodes.push({ requestId: id, branches });
        for (const branch of branches) {
          if (branch.kind === 'compensation_pair')
            seen.add(branch.compensation.request.id);
        }
      }
      return nodes;
    },
  };
}
