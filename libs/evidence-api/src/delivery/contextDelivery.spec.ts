import { describe, expect, it } from 'vitest';
import { fullLifecycleIndex } from '../testing/fixtures.js';
import { planContextDelivery } from './contextDelivery.js';

const catalog = 'context.product-catalog';
const sourcing = 'context.product-sourcing';
const payment = 'context.wechat-payment';
const procurement = 'context.product-procurement';
const fixture = async () =>
  structuredClone((await fullLifecycleIndex()).document);

describe('context delivery', () => {
  it('keeps global API addresses and removes only blocked contexts from the gateway', async () => {
    const model = await fixture();
    const complete = await planContextDelivery(model);
    expect(
      complete.contexts.map(({ contextId, status, issues }) => [
        contextId,
        status,
        issues,
      ]),
    ).toEqual([
      [catalog, 'ready', []],
      [procurement, 'ready', []],
      [sourcing, 'ready', []],
      [payment, 'ready', []],
    ]);
    const rule = model.rules.find(
      ({ contextRef }) => contextRef === procurement,
    )!;
    const expression = rule.expression;
    rule.expression = '(';
    const partial = await planContextDelivery(model);
    expect(
      partial.contexts.find(({ contextId }) => contextId === procurement),
    ).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'cel.syntaxError' }],
    });
    expect(partial.gateway['x-evidence-delivery-state']).toBe('partial');
    expect(partial.gateway['x-evidence-excluded-contexts']).toContain(
      procurement,
    );
    expect(partial.gateway.paths['/product-procurements']).toBeUndefined();
    expect(partial.gateway.paths['/products/{productId}']).toEqual(
      complete.gateway.paths['/products/{productId}'],
    );
    expect(partial.gateway.paths['/product-inquiries']).toBeDefined();
    rule.expression = expression;
    expect((await planContextDelivery(model)).gateway).toEqual(
      complete.gateway,
    );
  });

  it('attributes unresolved relationship targets to the known endpoint and leaves unrelated contexts alone', async () => {
    const model = await fixture();
    const refs = new Set(
      model.entities
        .filter(({ contextRef }) => contextRef === payment)
        .map(({ id }) => id),
    );
    const edge = model.relationships.find(
      ({ sourceRef, targetRef, kind }) =>
        refs.has(sourceRef) && refs.has(targetRef) && kind === 'references',
    )!;
    edge.targetRef = 'evidence.missing';
    const plan = await planContextDelivery(model);
    expect(
      plan.contexts.find(({ contextId }) => contextId === payment),
    ).toMatchObject({
      status: 'blocked',
      issues: expect.arrayContaining([
        expect.objectContaining({ targetRef: edge.id }),
      ]),
    });
    expect(
      plan.contexts.find(({ contextId }) => contextId === procurement),
    ).toMatchObject({
      status: 'blocked',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'API_DEPENDENCY_BLOCKED' }),
      ]),
    });
    expect(
      plan.contexts.find(({ contextId }) => contextId === catalog)?.status,
    ).toBe('ready');
  });
});
