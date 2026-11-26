import { readModelRoot } from '@evidence-poc/evidence-model-io';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { API_FIXTURES } from '../testing/fixtures.js';
import { sharedConfirmationModel } from '../testing/fulfillment.js';
import { buildModelDelivery, serviceContractsOf } from './modelDelivery.js';
import { assertOpenApiContract } from '../openapi/validateContract.js';
import { contractProblems } from '../testing/openapi.js';

import { buildDeliveryTopology } from './topology.js';

const model = async (): Promise<DomainModelDocument> => {
  const { document } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);

  return document;
};

describe('buildDeliveryTopology', () => {
  it('turns each Context into exactly one service with business route ownership', async () => {
    const { services } = buildDeliveryTopology(await model());

    expect(services.map((service) => service.id)).toEqual([
      'service.product-catalog',
      'service.product-procurement',
      'service.product-sourcing',
      'service.wechat-payment',
    ]);
    expect(services.map((service) => service.routePrefixes)).toEqual([
      ['/products'],
      [
        '/deliveries',
        '/invoices',
        '/payments',
        '/product-inquiries',
        '/product-procurements',
      ],
      ['/product-inquiries'],
      ['/wechat-charges', '/wechat-payments-6usx9m', '/wechat-payments-ewrw8v'],
    ]);
    for (const service of services) {
      expect(service).not.toHaveProperty('lane');
      expect(service.routes.length).toBeGreaterThan(0);
    }
  });

  it('reads a pre-contract Context as a channel and a domain Context as a domain', async () => {
    const { services } = buildDeliveryTopology(await model());
    const kindOf = (id: string) =>
      services.find((service) => service.id === id)?.kind;

    expect(kindOf('service.product-sourcing')).toBe('channel');
    expect(kindOf('service.product-catalog')).toBe('domain');
  });

  it('marks the Context that answers a capability socket as a capability service', async () => {
    const { services, links } = buildDeliveryTopology(await model());
    const wechat = services.find(
      (service) => service.id === 'service.wechat-payment',
    );
    const capability = links.filter((link) => link.kind === 'capability');

    expect(wechat?.kind).toBe('capability');
    expect(wechat?.supplies).toEqual(['role.payment-proof']);
    expect(capability).toHaveLength(1);
    expect(capability[0]?.to).toBe('service.product-procurement');
    expect(capability[0]?.mode).toBe('async');
  });

  it('links a channel to the contract it hands over to', async () => {
    const { links } = buildDeliveryTopology(await model());
    const signs = links.find((link) => link.kind === 'signs');

    expect(signs?.from).toBe('service.product-sourcing');
    expect(signs?.to).toBe('service.product-procurement');
    expect(signs?.viaRef).toBe('contract.product-procurement');
  });

  it('links a contract to the domain Context it reads', async () => {
    const { links } = buildDeliveryTopology(await model());
    expect(links).toContainEqual(
      expect.objectContaining({
        from: 'service.product-procurement',
        to: 'service.product-catalog',
        kind: 'subject',
        mode: 'reference',
      }),
    );
  });
});

it('keeps shared confirmation creation and reverse lookup with their owner', async () => {
  const delivery = buildModelDelivery(await sharedConfirmationModel());
  const { contract } = serviceContractsOf(delivery).find(
    ({ serviceId }) => serviceId === 'service.product-procurement',
  )!;
  expect(contract.paths['/payments']).toHaveProperty('post');
  expect(contract.paths['/payments/{paymentId}']).toHaveProperty('get');
  expect(
    contract.paths[
      '/product-procurements/{contractId}/payment-balance/payments'
    ],
  ).toHaveProperty('get');
});

it('exports valid service contracts whose unchanged operations partition the public API', async () => {
  const delivery = buildModelDelivery(await model());
  const seen = new Set<string>();
  for (const { serviceId, contract } of serviceContractsOf(delivery)) {
    await assertOpenApiContract(contract);
    expect(contractProblems(contract)).toEqual([]);
    for (const [path, entry] of Object.entries(contract.paths)) {
      for (const [method, operation] of Object.entries(entry)) {
        if (method !== 'get' && method !== 'post')
          throw new Error(`Unexpected method: ${method}`);
        expect(seen.has(method + path)).toBe(false);
        seen.add(method + path);
        expect(operation).toEqual(delivery.openapi.paths[path]![method]);
        expect(operation).toMatchObject({ 'x-evidence-service': serviceId });
      }
    }
  }
  expect(seen.size).toBe(delivery.routes.length);
  const signing = delivery.routes.find(({ id }) =>
    id.startsWith('route.sign-from-'),
  )!;
  expect(signing.path.startsWith('/product-inquiries/')).toBe(true);
  expect(signing.serviceId).toBe('service.product-procurement');
});
