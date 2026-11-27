import { describe, expect, it } from 'vitest';
import { createDomainGraph } from '../model/graph.js';
import { createProcurementModel } from '../testing/modelFixture.js';
import type { FlowStepTrace } from './types.js';
import { buildDeterministicFallbackChallenges } from './whatIfChallenges.js';

const step: FlowStepTrace = {
  sequence: 1,
  stepHash: 'first',
  entityId: 'request.payment',
  entityKind: 'fulfillment_request',
  entityLabel: '付款请求',
  exampleLabel: '首笔付款',
  asOf: '2026-12-31T00:30:00+08:00',
  basedOn: [],
  gaps: [],
  values: { expired_at: '2026-12-31T01:00:00+08:00' },
};

describe('business questions for deterministic What-If challenges', () => {
  it.each([
    [step.asOf, '次日（2027年1月1日）', '2026-12-31T17:00:00.000Z'],
    [
      '2027-01-03T01:00:00+08:00',
      '2027年1月4日（已过「付款截止时间」）',
      '2027-01-03T17:00:00.000Z',
    ],
  ])(
    'names the business day at the deadline offset when starting at %s',
    (asOf, day, instant) => {
      const graph = createDomainGraph(createProcurementModel());
      const current = { ...step, asOf };
      const rule = {
        ...graph.rules()[0]!,
        kind: 'breach' as const,
        expression: 'now > request.expired_at',
        bindings: {
          now: { type: 'timestamp' as const },
          request: { ref: step.entityId },
        },
      };
      const [card] = buildDeterministicFallbackChallenges(
        graph,
        [current],
        current,
        [rule],
      );
      expect(card?.question).toContain(day);
      expect(card?.question).toContain(
        '仍未按《付款请求》履约，会产生什么业务后果？对后续流程有何影响？',
      );
      expect(card?.question).not.toMatch(/T\d\d:|判定结果/u);
      expect(card?.hypothesisDraft).toEqual({ asOf: instant });
    },
  );

  it.each([
    ['CNY', '99.99元', '100.00元'],
    ['JPY', '9,999日元', '10,000日元'],
    ['KWD', '9.999科威特第纳尔', '10.000科威特第纳尔'],
    ['XZZ', '略低于约定金额', undefined],
  ])(
    'describes a one-subunit shortfall in %s and submits the exact amount',
    (currency, below, threshold) => {
      const graph = createDomainGraph(createProcurementModel());
      graph
        .getEntity(step.entityId)!
        .attributes!.push({
          name: 'amount',
          label: '实际到账',
          valueType: 'money',
          meaning: '入账金额',
        });
      const current = {
        ...step,
        values: { amount: { currency, minorUnits: 10000 } },
      };
      const rule = {
        ...graph.rules()[0]!,
        expression: 'request.amount.minorUnits >= 10000',
        bindings: { request: { ref: step.entityId } },
      };
      const [card] = buildDeterministicFallbackChallenges(
        graph,
        [current],
        current,
        [rule],
      );
      expect(card?.question).toContain(below);
      if (threshold) expect(card?.question).toContain(threshold);
      expect(card?.question).toContain(
        '会产生什么业务后果？对后续流程有何影响？',
      );
      expect(card?.question).not.toMatch(/最小(?:货币)?单位|minorUnits/u);
      expect(card?.hypothesisDraft?.values).toEqual({
        amount: { currency, minorUnits: 9999 },
      });
    },
  );
});
