import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  analyzeCelExpression,
  collectCelCandidates,
  completenessFindings,
  createDomainGraph,
} from '@evidence-poc/evidence-model-core';

import { digestBytes } from '../adapter/modelAdapter.js';
import { canonicalJson } from '../canonicalJson.js';
import { buildDelivery } from '../projector.js';
import { assertOpenApiContract } from '../openapi/validateContract.js';
import {
  errorDiagnostic,
  normalizeDiagnostics,
  type Diagnostic,
} from '../diagnostics.js';
import {
  buildDeliveryContract,
  serviceContractsOf,
  type DeliveryContract,
} from './modelDelivery.js';
import type { DeliveryRoute } from './routes.js';
import { contextModelOf } from './contextModel.js';

export interface ContextDelivery {
  contextId: string;
  status: 'ready' | 'blocked' | 'empty';
  issues: readonly Diagnostic[];
  contract?: DeliveryContract;
}

export interface ContextDeliveryPlan {
  modelId: string;
  modelDigest: string;
  contexts: readonly ContextDelivery[];
  gateway: DeliveryContract;
}

export class ContextDeliveryBlockedError extends Error {}

/** Project once so addresses never depend on which contexts pass their gate. */
export async function planContextDelivery(
  input: DomainModelDocument,
): Promise<ContextDeliveryPlan> {
  const {
    model,
    contexts: byContext,
    ownerOf: entityOwner,
  } = contextModelOf(input);
  const snapshot = buildDelivery(model);
  const modelDigest = [...byContext.values()].some((issues) => issues.length)
    ? `sha256:${digestBytes(canonicalJson(input))}`
    : snapshot.digests.model;
  const contextIds = [...byContext.keys()].sort((a, b) => a.localeCompare(b));
  const entities = new Map(model.entities.map((entity) => [entity.id, entity]));
  const routes = new Map(snapshot.routes.map((route) => [route.id, route]));
  const rules = new Map(model.rules.map((rule) => [rule.id, rule]));
  const edges = new Map(model.relationships.map((edge) => [edge.id, edge]));
  const global: Diagnostic[] = [];
  const record = (issue: Diagnostic) => {
    let attributed = false;
    for (const ref of [issue.targetRef, ...(issue.relatedRefs ?? [])]) {
      if (ref === undefined) continue;
      const edge = edges.get(ref);
      const rule = rules.get(ref);
      const owners = edge
        ? [entityOwner(edge.sourceRef), entityOwner(edge.targetRef)]
        : [
            entityOwner(ref),
            routes.get(ref)?.contextRef,
            rule?.contextRef,
            ...(rule?.target ? [entityOwner(rule.target.entityRef)] : []),
          ];
      for (const owner of new Set(owners)) {
        const bucket = owner === undefined ? undefined : byContext.get(owner);
        if (!bucket) continue;
        bucket.push(issue);
        attributed = true;
      }
    }
    if (!attributed) global.push(issue);
  };
  snapshot.diagnostics
    .filter(({ severity }) => severity === 'error')
    .forEach(record);
  for (const { entityRef, message } of completenessFindings(model))
    record(errorDiagnostic('FM_INCOMPLETE', message, entityRef));
  const graph = createDomainGraph(model);
  for (const rule of model.rules) {
    for (const { code, message } of analyzeCelExpression({
      expression: rule.expression,
      candidates: collectCelCandidates({
        graph,
        ruleId: rule.id,
        entityRef: rule.target?.entityRef ?? rule.contextRef,
      }),
    }).diagnostics)
      record(errorDiagnostic(code, message, rule.id));
  }
  if (global.length > 0)
    throw new ContextDeliveryBlockedError(
      global.map(({ code, message }) => `${code}: ${message}`).join('\n'),
    );

  const ownedRoutes = new Map<string, DeliveryRoute[]>();
  const itemByEntity = new Map<string, DeliveryRoute>();
  for (const route of snapshot.routes) {
    const owned = ownedRoutes.get(route.contextRef) ?? [];
    owned.push(route);
    ownedRoutes.set(route.contextRef, owned);
    if (route.id === `route.read.${route.entityRef}`)
      itemByEntity.set(route.entityRef, route);
  }
  const dependencies = new Map<string, Set<string>>();
  const requireContext = (consumer: string, provider: string) => {
    if (consumer === provider) return;
    const required = dependencies.get(consumer) ?? new Set<string>();
    required.add(provider);
    dependencies.set(consumer, required);
  };
  const requireItem = (consumer: string, ref: string) => {
    const item = itemByEntity.get(ref);
    if (item) requireContext(consumer, item.contextRef);
    else
      byContext
        .get(consumer)
        ?.push(
          errorDiagnostic(
            'API_REQUIRED_ROUTE_MISSING',
            `缺少依赖资源的查询接口：${ref}`,
            ref,
          ),
        );
  };
  for (const route of snapshot.routes) {
    for (const ref of new Set([
      ...Object.values(route.parameterEntityRefs),
      ...(route.requestRefs ?? []),
      ...(route.requestRef ? [route.requestRef] : []),
    ]))
      requireItem(route.contextRef, ref);
  }
  // A used evidence socket has at least one available confirmation provider.
  // Optional navigation links are rebuilt on the selected routes, not made prerequisites.
  const providers = new Map<string, Set<string>>();
  for (const edge of model.relationships) {
    const source = entities.get(edge.sourceRef);
    const item = itemByEntity.get(edge.sourceRef);
    if (
      edge.kind !== 'plays_role' ||
      source?.kind !== 'fulfillment_confirmation' ||
      !item
    )
      continue;
    const group = providers.get(edge.targetRef) ?? new Set<string>();
    group.add(item.contextRef);
    providers.set(edge.targetRef, group);
  }
  const sockets = new Map<string, Set<string>>();
  const useSocket = (contextId: string, ref: string) => {
    const entity = entities.get(ref);
    if (entity?.category !== 'role' || entity.kind !== 'evidence') return;
    const used = sockets.get(contextId) ?? new Set<string>();
    used.add(ref);
    sockets.set(contextId, used);
  };
  for (const edge of model.relationships) {
    const owner = entityOwner(edge.sourceRef);
    if (!owner || edge.kind !== 'references') continue;
    useSocket(owner, edge.targetRef);
    // A domain fact with an HTTP resource is an actual contract dependency.
    const provider = itemByEntity.get(edge.targetRef);
    if (provider && entities.get(provider.contextRef)?.kind === 'domain')
      requireContext(owner, provider.contextRef);
  }
  for (const rule of model.rules) {
    for (const binding of Object.values(rule.bindings)) {
      if (!('ref' in binding)) continue;
      useSocket(rule.contextRef, binding.ref);
      const provider = itemByEntity.get(binding.ref);
      if (provider) requireContext(rule.contextRef, provider.contextRef);
    }
  }
  const serviceViews = serviceContractsOf(snapshot);
  for (const { serviceId, contract } of serviceViews) {
    const service = snapshot.services.find(({ id }) => id === serviceId)!;
    const issues = byContext.get(service.contextRef)!;
    if (issues.length > 0) continue;
    try {
      await assertOpenApiContract(contract);
    } catch (error) {
      issues.push(
        errorDiagnostic(
          'API_CONTEXT_INVALID',
          String(error),
          service.contextRef,
        ),
      );
    }
  }
  const ready = new Set(
    [...ownedRoutes.keys()].filter((id) => byContext.get(id)?.length === 0),
  );
  // Iterate to a fixed point: a provider may itself depend on a blocked context.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of ready) {
      const unavailable = [...(dependencies.get(id) ?? [])].filter(
        (ref) => !ready.has(ref),
      );
      const missing = [...(sockets.get(id) ?? [])].filter(
        (ref) =>
          ![...(providers.get(ref) ?? [])].some((provider) =>
            ready.has(provider),
          ),
      );
      if (!unavailable.length && !missing.length) continue;
      ready.delete(id);
      changed = true;
      byContext
        .get(id)!
        .push(
          errorDiagnostic(
            'API_DEPENDENCY_BLOCKED',
            `依赖接口未就绪：${[...unavailable, ...missing].sort().join('、')}`,
            id,
          ),
        );
    }
  }
  const selectedServices = snapshot.services.filter(({ contextRef }) =>
    ready.has(contextRef),
  );
  const selectedRoutes = snapshot.routes.filter(({ contextRef }) =>
    ready.has(contextRef),
  );
  const gateway = buildDeliveryContract(
    model,
    selectedRoutes,
    selectedServices,
  );
  const excluded = contextIds.filter(
    (contextRef) => (byContext.get(contextRef)?.length ?? 0) > 0,
  );
  gateway['x-evidence-delivery-state'] = excluded.length
    ? 'partial'
    : 'complete';
  gateway['x-evidence-excluded-contexts'] = excluded;
  const draftDescription = `${gateway.info.description}\n自动同步的 API 草稿，不代表已授权发布。`;
  gateway.info.description = excluded.length
    ? `${draftDescription}\n未收录的上下文：${excluded.join('、')}。`
    : draftDescription;
  await assertOpenApiContract(gateway);

  const views = new Map(
    serviceContractsOf({
      openapi: gateway,
      routes: selectedRoutes,
      services: selectedServices,
    }).map(
      ({ contract }) =>
        [contract['x-evidence-services'][0]?.contextRef, contract] as const,
    ),
  );
  return {
    modelId: snapshot.modelId,
    modelDigest,
    gateway,
    contexts: contextIds.map((contextRef) => {
      const issues = normalizeDiagnostics(byContext.get(contextRef) ?? []);
      const contract = views.get(contextRef);
      if (contract) {
        // Gateway-only state must not dirty every context when an unrelated context changes.
        delete contract['x-evidence-delivery-state'];
        delete contract['x-evidence-excluded-contexts'];
        contract.info.description = draftDescription;
      }
      return {
        contextId: contextRef,
        issues,
        status: contract ? 'ready' : issues.length ? 'blocked' : 'empty',
        ...(contract ? { contract } : {}),
      };
    }),
  };
}
