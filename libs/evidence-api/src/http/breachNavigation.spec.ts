import { recordBreachOutcomeMutator } from '@evidence-poc/evidence-model-core';
import { validateProjection } from '../loader/apiLoader.js';
import { buildDelivery } from '../projector.js';
import { operationFor } from '../testing/contract.js';
import { procurementEvolution } from '../testing/procurement.js';
import { halLinksFor } from './hateoasWeaver.js';
import { resolveRuntimeHalLinks } from './runtimeLinks.js';

const modeledBranches = () => {
  const model = procurementEvolution()[3]!;
  model.relationships.find(
    (edge) =>
      edge.sourceRef === 'request.delivery' &&
      edge.targetRef === 'contract.agreement',
  )!.sourceCardinality = { min: 0, max: 'many' };
  for (const [original, name] of [
    ['delivery', 'refund'],
    ['refund', 'penalty'],
  ]) {
    recordBreachOutcomeMutator(model, {
      requestRef: `request.${original}`,
      condition: '未按约完成',
      outcome: {
        kind: 'compensation_pair',
        request: {
          id: `request.${name}`,
          label: name,
          responsibleRoleRef: 'role.buyer',
        },
        confirmation: {
          id: `confirmation.${name}`,
          label: name,
          responsibleRoleRef: 'role.seller',
        },
      },
    });
  }
  recordBreachOutcomeMutator(model, {
    requestRef: 'request.penalty',
    condition: '赔付未到账，移交法务',
    outcome: {
      kind: 'terminal_escalation',
      remedyKind: 'arbitration',
      handoff: {
        id: 'evidence.handoff',
        label: '移交法务',
        responsibleRoleRef: 'role.buyer',
      },
    },
  });
  return buildDelivery(model);
};

it('projects each confirmed branch once and records legal hand-off rather than filing a case', () => {
  const snapshot = modeledBranches();
  const { routes, hypermedia } = snapshot;
  const branchFor = (ref: string) =>
    routes.find((route) => route.breachBranch?.breachedRequestRef === ref)!;
  const refund = branchFor('request.delivery');
  expect(refund.purpose).toBe('compensate');
  expect(refund.path).toContain('/compensations/');
  expect(refund.parameterEntityRefs).toHaveProperty(
    'deliveryId',
    'request.delivery',
  );
  expect(
    routes.filter(
      ({ entityRef, method }) =>
        entityRef === 'request.refund' && method === 'POST',
    ),
  ).toEqual([refund]);
  const penalty = branchFor('request.refund');
  const escalation = branchFor('request.penalty');
  expect(penalty.path.startsWith(refund.itemPath)).toBe(true);
  expect(escalation).toMatchObject({
    purpose: 'escalate',
    serviceId: refund.serviceId,
    entityRef: 'evidence.handoff',
  });
  expect(escalation.path).toContain('/handoffs/');
  expect(escalation.path).not.toContain('/arbitration');
  expect(operationFor(snapshot, escalation.id)).toMatchObject({
    'x-evidence-breach-branch': {
      kind: 'escalation',
      remedyKind: 'arbitration',
    },
    'x-evidence-allowed-party-roles': ['role.buyer'],
  });
  expect(
    hypermedia.filter(({ breachBranch }) => breachBranch !== undefined),
  ).toHaveLength(3);
  expect(
    hypermedia.some(
      ({ rel, targetRouteId }) =>
        rel.startsWith('next:') && targetRouteId === refund.id,
    ),
  ).toBe(false);
  const deliveryStep = snapshot.journeys.find(
    ({ routeId }) => routeId === 'route.request.request.delivery',
  )!;
  expect(deliveryStep.nextPossibleSteps).toContain(
    `step.${refund.id}.role.buyer`,
  );
  expect(validateProjection(snapshot)).toEqual([]);
});

it('publishes conditional templates but exposes only bound branches the owner declares available', () => {
  const snapshot = modeledBranches();
  const source = 'route.read.request.delivery';
  const candidates = snapshot.hypermedia.filter(
    ({ sourceRouteId }) => sourceRouteId === source,
  );
  const branch = candidates.find(
    ({ breachBranch }) => breachBranch !== undefined,
  )!;
  expect(halLinksFor(candidates, source)).not.toHaveProperty([branch.rel]);
  expect(Object.keys(halLinksFor(candidates, source, true))).toContain(
    branch.rel,
  );
  const parameters = Object.fromEntries(
    [...branch.href.matchAll(/\{([^{}]+)\}/g)].map(([, name]) => [
      name!,
      'id/1',
    ]),
  );
  for (const available of [false, 'unknown'] as const) {
    expect(
      resolveRuntimeHalLinks(candidates, source, () => ({ available })),
    ).toEqual({});
  }
  expect(
    resolveRuntimeHalLinks(candidates, source, () => ({
      available: true,
      parameters: {},
    })),
  ).not.toHaveProperty([branch.rel]);
  expect(
    resolveRuntimeHalLinks(candidates, source, (link) =>
      link === branch ? { available: true, parameters } : { available: false },
    )[branch.rel],
  ).toMatchObject({
    href: expect.stringMatching(/id%2F1.*\/compensations\//),
    method: 'POST',
  });
});
