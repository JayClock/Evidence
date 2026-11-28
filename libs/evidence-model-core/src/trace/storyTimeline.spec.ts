import { describe, expect, it } from 'vitest';
import type {
  DomainModelDocument,
  EvidenceEntityAST,
  RuleAST,
} from '@evidence-poc/evidence-schema';
import { collectFlowScenarios } from './flowAggregator.js';
import { createScenarioTimeline } from './storyTimeline.js';

const iso = (hours: number) =>
  new Date(Date.UTC(2026, 0, 1, hours)).toISOString();
const time = (name: string, timeRole: 'start' | 'deadline' | 'occurrence') => ({
  name,
  label: name,
  meaning: name,
  timeRole,
  valueType: 'timestamp' as const,
});
const example = (
  label: string,
  hour: number,
  value: Record<string, string>,
  basedOn?: string[],
) => ({
  label,
  value,
  test: {
    flow: 'delivery',
    actingRoleRef: 'role.buyer',
    asOf: iso(hour),
    basedOn,
  },
});
const request: EvidenceEntityAST = {
  type: 'entity',
  category: 'evidence',
  kind: 'fulfillment_request',
  id: 'request.delivery',
  label: '交付请求',
  attributes: [time('started_at', 'start'), time('expired_at', 'deadline')],
  examples: [example('first', 0, { started_at: iso(0), expired_at: iso(2) })],
};
const confirmation: EvidenceEntityAST = {
  type: 'entity',
  category: 'evidence',
  kind: 'fulfillment_confirmation',
  id: 'confirmation.delivery',
  label: '交付确认',
  attributes: [time('confirmed_at', 'occurrence')],
  examples: [
    example('late', 3, { confirmed_at: iso(3) }, ['request.delivery#first']),
  ],
};
const inWindow =
  'confirmations.exists(c, c.confirmed_at >= request.started_at && c.confirmed_at <= request.expired_at)';
const completion: RuleAST = {
  type: 'rule',
  kind: 'completion',
  id: 'rule.completed',
  label: '按期交付',
  contextRef: 'context.delivery',
  description: '确认是否实际发生在约定窗口内。',
  resultType: 'bool',
  bindings: {
    request: { ref: request.id },
    confirmations: { ref: confirmation.id, cardinality: 'many' },
  },
  expression: inWindow,
};
const breach: RuleAST = {
  ...completion,
  kind: 'breach',
  id: 'rule.late',
  label: '逾期交付',
  bindings: { ...completion.bindings, now: { type: 'timestamp' } },
  expression: `now > request.expired_at && !${inWindow}`,
};
const model = () =>
  structuredClone({
    entities: [
      request,
      confirmation,
      { ...request, id: 'request.refund', label: '退款请求', examples: [] },
    ],
    rules: [completion, breach],
    relationships: [
      {
        type: 'relationship',
        id: 'relation.delivery',
        kind: 'references',
        label: '确认请求',
        sourceRef: confirmation.id,
        targetRef: request.id,
      },
      {
        type: 'relationship',
        id: 'relation.refund',
        kind: 'references',
        flowKind: 'breach_compensation',
        label: '退款补偿',
        sourceRef: 'request.refund',
        targetRef: request.id,
      },
    ],
  }) as DomainModelDocument;
const timelineOf = (document: DomainModelDocument) =>
  createScenarioTimeline(document, collectFlowScenarios(document)[0]!)!;

describe('story timeline', () => {
  it('respects the deadline boundary and does not create the modeled remedy', () => {
    const document = model();
    const before = structuredClone(document);
    const timeline = timelineOf(document);
    const deadline = Date.parse(iso(2));
    expect(timeline.marks.map(({ kind }) => kind)).toEqual([
      'step',
      'deadline',
      'step',
    ]);
    expect(timeline.at(deadline)[0]?.status).toBe('waiting');
    expect(timeline.at(deadline + 1)).toMatchObject([
      {
        status: 'breached',
        triggeredRules: [{ id: breach.id }],
        ruleResults: expect.arrayContaining([
          expect.objectContaining({ id: breach.id, status: 'satisfied' }),
        ]),
        responses: [{ entityId: 'request.refund' }],
      },
    ]);
    expect(timeline.at(Date.parse(iso(3)))[0]?.status).toBe('breached');
    expect(timeline.at(deadline)[0]?.responses).toEqual([]);
    expect(document).toEqual(before);
  });

  it('includes a confirmation at the deadline but never uses it for a different request instance', () => {
    const document = model();
    document.entities[0]!.examples!.push(
      example('second', 1, { started_at: iso(1), expired_at: iso(2) }),
    );
    document.entities[1]!.examples = [
      example('on-time', 2, { confirmed_at: iso(2) }, [
        'request.delivery#first',
      ]),
    ];
    const timeline = timelineOf(document);
    expect(timeline.at(Date.parse(iso(2))).map(({ status }) => status)).toEqual(
      ['completed', 'waiting'],
    );
    expect(timeline.at(timeline.end).map(({ status }) => status)).toEqual([
      'completed',
      'breached',
    ]);
  });

  it('does not expose a later keyframe at the same clock value', () => {
    const document = model();
    document.entities[1]!.examples = [
      example('immediate', 0, { confirmed_at: iso(0) }, [
        'request.delivery#first',
      ]),
    ];
    const timeline = timelineOf(document);
    expect(timeline.at(timeline.start, 0)[0]?.status).toBe('waiting');
    expect(timeline.at(timeline.start, 1)[0]?.status).toBe('completed');
  });

  it('keeps an uncorrelated confirmation and missing clock inputs unknown', () => {
    const document = model();
    document.entities[1]!.examples![0]!.test!.basedOn = [];
    expect(timelineOf(document).at(Date.parse(iso(3)))[0]?.status).toBe(
      'unknown',
    );
    document.entities[0]!.examples![0]!.value = { started_at: iso(0) };
    expect(
      timelineOf(document).marks.every(({ kind }) => kind === 'step'),
    ).toBe(true);
    expect(timelineOf(document).at(Date.parse(iso(1)))[0]?.status).toBe(
      'unknown',
    );
  });

  it('recomputes a derived deadline without trusting the declared expected value', () => {
    const document = model();
    document.entities[0]!.attributes!.find(
      ({ name }) => name === 'expired_at',
    )!.derivedByRuleRef = 'rule.deadline';
    document.entities[0]!.examples![0]!.value.expired_at = iso(99);
    document.rules.push({
      type: 'rule',
      id: 'rule.deadline',
      label: '计算截止时点',
      description: '发起后经过两小时。',
      contextRef: 'context.delivery',
      kind: 'derivation',
      target: { entityRef: request.id, attribute: 'expired_at' },
      bindings: { request: { ref: request.id } },
      expression: 'request.started_at + duration("7200s")',
      resultType: 'timestamp',
    });
    const timeline = timelineOf(document);
    expect(timeline.marks.find(({ kind }) => kind === 'deadline')?.time).toBe(
      Date.parse(iso(2)),
    );
    expect(timeline.at(Date.parse(iso(2)) + 1)[0]?.status).toBe('breached');
    expect(document.entities[0]!.examples![0]!.value.expired_at).toBe(iso(99));
  });

  it('does not treat a rejected confirmation example as delivery', () => {
    const document = model();
    document.entities[1]!.examples = [
      example('rejected', 1, { confirmed_at: iso(1) }, [
        'request.delivery#first',
      ]),
    ];
    document.entities[1]!.examples[0]!.test!.expectedStatus = 409;
    const timeline = timelineOf(document);
    expect(timeline.marks.filter(({ kind }) => kind === 'step')).toHaveLength(
      2,
    );
    expect(timeline.at(timeline.end)[0]?.status).toBe('breached');
  });

  it('does not sort away a causal clock conflict', () => {
    const document = model();
    document.entities[0]!.examples![0]!.test!.asOf = iso(4);
    const flow = collectFlowScenarios(document)[0]!;
    expect(createScenarioTimeline(document, flow)).toBeNull();
  });

  it('reports an overdue flow request without a modeled breach rule', () => {
    const document = model();
    document.rules = [];
    const timeline = timelineOf(document);
    expect(timeline.at(timeline.start)[0]?.status).toBe('waiting');
    expect(timeline.at(timeline.end)).toMatchObject([
      { status: 'overdue', responses: [] },
    ]);
  });
});
