import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type {
  DeliveryBreachBranch,
  DeliveryRoute,
} from '../delivery/routes.js';
import type { ApiJourneyStep } from '../types.js';
import { allowedCallerRoleRefs } from '../delivery/addressing.js';

export interface HypermediaLink {
  sourceRouteId: string;
  targetRouteId: string;
  rel: string;
  href: string;
  method: DeliveryRoute['method'];
  templated: boolean;
  /** A documented possibility; evaluated against a resource instance by its owner. */
  breachBranch?: DeliveryBreachBranch;
}

/** References describe possible navigation, never runtime readiness or permissions. */
export const weaveHypermedia = (
  document: DomainModelDocument,
  routes: readonly DeliveryRoute[],
): HypermediaLink[] => {
  const links = new Map<string, HypermediaLink>();
  const byEntity = new Map<string, DeliveryRoute[]>();
  for (const route of routes) {
    const group = byEntity.get(route.entityRef) ?? [];
    group.push(route);
    byEntity.set(route.entityRef, group);
  }
  const forEntity = (ref: string) => byEntity.get(ref) ?? [];
  const primaryOf = (route: DeliveryRoute) =>
    forEntity(route.entityRef).find(
      (candidate) =>
        candidate.method === 'GET' &&
        candidate.responseShape === 'item' &&
        candidate.path === route.itemPath,
    );
  const add = (
    source: DeliveryRoute,
    target: DeliveryRoute,
    rel: string,
    branch?: DeliveryBreachBranch,
  ) => {
    const link = {
      sourceRouteId: source.id,
      targetRouteId: target.id,
      rel,
      href: target.path,
      method: target.method,
      templated: target.path.includes('{'),
      ...(branch === undefined ? {} : { breachBranch: branch }),
    };
    links.set(`${source.id}\0${rel}\0${target.id}`, link);
  };
  for (const route of routes) {
    const target =
      route.responseShape === 'collection' ? route : primaryOf(route);
    if (target !== undefined) add(route, target, 'self');
    const branch = route.breachBranch;
    if (branch === undefined) continue;
    const rel =
      branch.kind === 'escalation'
        ? `escalate:${branch.remedyKind}:${branch.relationshipRef}`
        : `breach:compensate:${branch.relationshipRef}`;
    for (const source of forEntity(branch.breachedRequestRef)) {
      if (source.method === 'GET' && source.responseShape === 'item')
        add(source, route, rel, branch);
    }
  }
  const entities = new Map(
    document.entities.map((entity) => [entity.id, entity]),
  );
  const socketProviders = new Map<string, string[]>();
  for (const edge of document.relationships) {
    if (
      edge.kind !== 'plays_role' ||
      entities.get(edge.sourceRef)?.kind !== 'fulfillment_confirmation' ||
      entities.get(edge.targetRef)?.kind !== 'evidence'
    )
      continue;
    const providers = socketProviders.get(edge.targetRef) ?? [];
    providers.push(edge.sourceRef);
    socketProviders.set(edge.targetRef, providers);
  }
  for (const edge of document.relationships) {
    if (
      edge.kind !== 'references' ||
      (edge.flowKind ?? 'primary') !== 'primary'
    )
      continue;
    const dependent = entities.get(edge.sourceRef);
    const prerequisite = entities.get(edge.targetRef);
    if (
      dependent?.category === 'evidence' &&
      prerequisite?.category === 'role' &&
      prerequisite.kind === 'evidence'
    ) {
      for (const providerRef of socketProviders.get(prerequisite.id) ?? []) {
        const target = forEntity(providerRef).find(
          (route) => route.method === 'GET' && route.responseShape === 'item',
        );
        if (target !== undefined)
          for (const source of forEntity(dependent.id).filter(
            ({ responseShape }) => responseShape === 'item',
          ))
            add(source, target, `capability:${prerequisite.id}:${providerRef}`);
      }
      continue;
    }
    if (
      dependent?.category === 'evidence' &&
      prerequisite?.category === 'participant' &&
      prerequisite.kind === 'thing'
    ) {
      const subject = forEntity(prerequisite.id).find(
        (route) => route.method === 'GET' && route.responseShape === 'item',
      );
      if (subject !== undefined)
        for (const source of forEntity(dependent.id).filter(
          ({ responseShape }) => responseShape === 'item',
        ))
          add(source, subject, `subject:${prerequisite.id}`);
      continue;
    }
    if (
      dependent?.category !== 'evidence' ||
      prerequisite?.category !== 'evidence'
    )
      continue;
    const sources = forEntity(prerequisite.id);
    const dependentRoutes = forEntity(dependent.id);
    const targets = dependentRoutes.filter((route) => {
      if (route.method !== 'POST' || route.breachBranch !== undefined)
        return false;
      if (dependent.kind === 'contract' && prerequisite.kind === 'proposal') {
        // Overlay paths are presentation; the signing entrance still belongs to this proposal.
        return (
          route.id === `route.sign-from-${prerequisite.id}.${dependent.id}`
        );
      }
      return !route.id.startsWith('route.sign-from-');
    });
    for (const source of sources) {
      for (const target of targets) add(source, target, `next:${dependent.id}`);
    }
    if (
      dependent.kind === 'fulfillment_confirmation' &&
      prerequisite.kind === 'fulfillment_request'
    ) {
      const trace = dependentRoutes.find(
        (route) =>
          route.method === 'GET' &&
          route.responseShape === 'collection' &&
          route.requestRef === prerequisite.id,
      );
      const request = sources.find(
        (route) => route.method === 'GET' && route.responseShape === 'item',
      );
      if (trace !== undefined) {
        for (const source of sources.filter(
          (route) => route.responseShape === 'item',
        ))
          add(source, trace, `confirmations:${dependent.id}`);
      }
      if (request !== undefined) {
        for (const source of dependentRoutes.filter(
          (route) => route.responseShape === 'item',
        ))
          add(source, request, `request:${prerequisite.id}`);
        if (
          prerequisite.asyncAcceptance === true &&
          prerequisite.contextRef === dependent.contextRef
        ) {
          const primary = dependentRoutes.find(
            (route) =>
              route.method === 'GET' &&
              route.responseShape === 'item' &&
              route.path === route.itemPath,
          );
          if (primary !== undefined)
            add(request, primary, `result:${dependent.id}`);
        }
      }
    }
  }
  return [...links.values()].sort((a, b) =>
    `${a.sourceRouteId}\0${a.rel}\0${a.targetRouteId}`.localeCompare(
      `${b.sourceRouteId}\0${b.rel}\0${b.targetRouteId}`,
    ),
  );
};

/** Static documentation is not a live resource representation. */
export const halLinksFor = (
  links: readonly HypermediaLink[],
  routeId: string,
  includeConditionalTemplates = false,
): Record<string, unknown> =>
  Object.fromEntries(
    links
      .filter(
        (link) =>
          link.sourceRouteId === routeId &&
          (includeConditionalTemplates || link.breachBranch === undefined),
      )
      .map((link) => [
        link.rel,
        {
          href: link.href,
          templated: link.templated,
          ...(link.rel === 'self' ? {} : { method: link.method }),
          ...(link.breachBranch === undefined
            ? {}
            : { breachBranch: link.breachBranch }),
        },
      ]),
  );

/** A graph of possible steps; branches and cycles remain graphs, not an invented sequence. */
export const deriveJourneys = (
  routes: readonly DeliveryRoute[],
  links: readonly HypermediaLink[],
): ApiJourneyStep[] => {
  const steps = routes
    .filter((route) => route.method === 'POST')
    .flatMap((route) =>
      allowedCallerRoleRefs(route).map((roleRef) => ({
        id: `step.${route.id}.${roleRef}`,
        roleRef,
        routeId: route.id,
        method: route.method,
        path: route.path,
        purpose: route.purpose,
        nextPossibleSteps: [] as string[],
      })),
    );
  const routeById = new Map(routes.map((route) => [route.id, route]));
  for (const step of steps) {
    const next = new Set(
      links
        .filter(
          (link) =>
            link.rel !== 'self' &&
            (link.sourceRouteId === step.routeId ||
              (link.breachBranch !== undefined &&
                routeById.get(step.routeId)?.entityRef ===
                  link.breachBranch.breachedRequestRef)),
        )
        .map((link) => link.targetRouteId),
    );
    step.nextPossibleSteps = steps
      .filter((candidate) => next.has(candidate.routeId))
      .map((candidate) => candidate.id)
      .sort();
  }
  return steps.sort((a, b) => a.id.localeCompare(b.id));
};
