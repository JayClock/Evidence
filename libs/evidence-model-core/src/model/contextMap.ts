import {
  isAttributeSourceReference,
  isContextEntity,
  isFulfillmentConfirmation,
  isFulfillmentRequest,
  type ContextEntityAST,
} from '@evidence-poc/evidence-schema';
import type { DomainGraph } from './graph.js';

export const CONTEXT_MAP_LINK_LABELS = {
  capability: '能力供给',
  evidence: '凭证依赖',
  domain: '领域依赖',
  channel: '签约渠道',
} as const;

type LinkKind = keyof typeof CONTEXT_MAP_LINK_LABELS;
type ContextLink = {
  id: string;
  kind: LinkKind;
  sourceRef: string;
  targetRef: string;
  origins: Set<string>;
  sockets: Set<string>;
};

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Consumer → provider. Keep the evidence IDs needed to inspect every assertion. */
export function deriveContextMapGraph(graph: DomainGraph) {
  const contexts = graph
    .entities()
    .filter(isContextEntity)
    .sort((a, b) => compare(a.id, b.id));
  const contextIds = new Set(contexts.map(({ id }) => id));
  const links = new Map<string, ContextLink>();
  const add = (
    kind: LinkKind,
    sourceRef: string | undefined,
    targetRef: string | undefined,
    origins: string[],
    socket?: string,
  ) => {
    if (
      !sourceRef ||
      !targetRef ||
      sourceRef === targetRef ||
      !contextIds.has(sourceRef) ||
      !contextIds.has(targetRef)
    )
      return;
    const id = `${sourceRef}:${targetRef}:${kind}`;
    let edge = links.get(id);
    if (!edge) {
      edge = {
        id,
        kind,
        sourceRef,
        targetRef,
        origins: new Set(),
        sockets: new Set(),
      };
      links.set(id, edge);
    }
    for (const origin of origins) edge.origins.add(origin);
    if (socket) edge.sockets.add(socket);
  };
  const contextOf = (ref: string): ContextEntityAST | undefined => {
    const entity = graph.getEntity(ref);
    if (isContextEntity(entity)) return entity;
    const context =
      entity && 'contextRef' in entity && entity.contextRef
        ? graph.getEntity(entity.contextRef)
        : undefined;
    return isContextEntity(context) ? context : undefined;
  };
  const classify = (context: ContextEntityAST | undefined): LinkKind =>
    context?.kind === 'domain'
      ? 'domain'
      : context?.kind === 'pre_contract'
        ? 'channel'
        : 'evidence';

  for (const relationship of graph.relationships()) {
    if (relationship.kind !== 'references') continue;
    const source = contextOf(relationship.sourceRef);
    const target = contextOf(relationship.targetRef);
    add(classify(target), source?.id, target?.id, [relationship.id]);
  }
  for (const entity of graph.entities()) {
    for (const field of entity.attributes ?? []) {
      if (!isAttributeSourceReference(field.source)) continue;
      const target = contextOf(field.source.entityRef);
      add(classify(target), contextOf(entity.id)?.id, target?.id, [
        `${entity.id}#${field.name}`,
      ]);
    }
  }
  for (const rule of graph.rules()) {
    for (const binding of Object.values(rule.bindings)) {
      if (!('ref' in binding)) continue;
      const target = contextOf(binding.ref);
      add(classify(target), rule.contextRef, target?.id, [rule.id]);
    }
  }

  const clusters = contexts.map((context) => {
    if (context.kind === 'pre_contract')
      add('channel', context.parentContextRef, context.id, [context.id]);
    const members = graph.entitiesInContext(context.id);
    const root = graph.rootContractOf(context.id);
    const sockets = graph
      .socketRolesInContext(context.id)
      .map(({ id, label }) => {
        const inbound = graph.incoming(id);
        const consumers = inbound.filter(
          (edge) =>
            edge.kind === 'references' &&
            contextOf(edge.sourceRef)?.id === context.id,
        );
        const providers = inbound.flatMap((edge) => {
          const provider = graph.getEntity(edge.sourceRef);
          const owner = contextOf(edge.sourceRef);
          if (
            edge.kind !== 'plays_role' ||
            provider?.category !== 'evidence' ||
            !owner ||
            owner.id === context.id
          )
            return [];
          add(
            'capability',
            context.id,
            owner.id,
            [edge.id, ...consumers.map(({ id }) => id)],
            id,
          );
          return [edge.sourceRef];
        });
        return {
          id,
          label,
          providerRefs: [...new Set(providers)].sort(compare),
        };
      });
    const requests = members.filter(isFulfillmentRequest);
    return {
      id: context.id,
      label: context.label,
      kind: context.kind,
      rootRef: root?.id,
      partyLabels: (root?.roleRefs ?? []).flatMap(
        (ref) => graph.getEntity(ref)?.label ?? [],
      ),
      counts: {
        requests: requests.length,
        confirmations: members.filter(isFulfillmentConfirmation).length,
        pairs: requests.filter(
          ({ id }) =>
            (graph.fulfillmentPair(id)?.confirmations.length ?? 0) > 0,
        ).length,
        remedies: requests.reduce(
          (n, { id }) =>
            n +
            graph
              .breachOutcomesOf(id)
              .filter((branch) => branch.kind === 'terminal_escalation').length,
          0,
        ),
        subjects: members.filter(
          (entity) =>
            entity.category === 'participant' && entity.kind === 'thing',
        ).length,
        rules: graph.rulesInContext(context.id).length,
      },
      sockets,
    };
  });
  return {
    clusters,
    edges: [...links.values()]
      .sort((a, b) => compare(a.id, b.id))
      .map(({ origins, sockets, ...edge }) => ({
        ...edge,
        originRefs: [...origins].sort(compare),
        socketRefs: [...sockets].sort(compare),
      })),
  };
}

export type ContextMapGraph = ReturnType<typeof deriveContextMapGraph>;
