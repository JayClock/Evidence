import { describe, expect, it } from 'vitest';
import {
  createEmptyDomainModel,
  DomainModelDocumentSchema,
  isEvidenceEntity,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '../model/graph.js';
import { createModelSession } from '../session/createModelSession.js';
import {
  assignFulfillmentContextMutator,
  batchAddEvidenceMutator,
  bindKeyDataSourceMutator,
  recordBreachOutcomeMutator,
  splitEvidenceToPairMutator,
} from './evidenceGrowth.js';

const occurrences = {
  name: 'paid_at',
  label: '付款时间',
  meaning: '资金实际到账时间',
  timeRole: 'occurrence',
} as const;
const field = {
  name: 'amount',
  label: '金额',
  meaning: '申请中约定的付款金额',
  valueType: 'int',
} as const;
const payment = {
  id: 'evidence.payment',
  label: '付款确认',
  stage: 'fulfillment',
  times: [occurrences],
  keyData: [field],
} as const;
const split = {
  evidenceRef: payment.id,
  request: { mode: 'create', id: 'request.payment', label: '付款申请' },
  inputAttributes: [
    { confirmationAttribute: 'amount', requestAttribute: 'requested_amount' },
  ],
} as const;
const pairIntent = () => ({
  ...split,
  inputAttributes: [...split.inputAttributes],
});
const storm = (draft: DomainModelDocument) =>
  batchAddEvidenceMutator(draft, {
    evidences: [
      { ...payment, times: [...payment.times], keyData: [...payment.keyData] },
    ],
  });
const contractContext = {
  type: 'entity',
  category: 'context',
  kind: 'contract',
  id: 'context.sale',
  label: '买卖合同',
} as const;

const seed = () => {
  const model = createEmptyDomainModel();
  model.entities.push(contractContext);
  storm(model);
  return model;
};

describe('evidence growth', () => {
  it('stores named, unanchored evidence without inventing missing time or roles', () => {
    const model = seed();
    batchAddEvidenceMutator(model, {
      evidences: [
        {
          id: 'evidence.rfp',
          label: '询价',
          stage: 'rfp',
          times: [{ ...occurrences, name: 'inquired_at', timeRole: 'start' }],
        },
        { id: 'evidence.quote', label: '报价', stage: 'proposal' },
      ],
    });
    expect(DomainModelDocumentSchema.parse(model).entities).toEqual(
      model.entities,
    );
    expect(model.entities.at(-1)).toMatchObject({ attributes: [] });
    expect(() =>
      batchAddEvidenceMutator(model, {
        evidences: [
          {
            id: 'evidence.invalid',
            label: '无效命名',
            stage: 'contract',
            times: [{ ...occurrences, name: 'signed_date' }],
          },
        ],
      }),
    ).toThrow('_at');
  });

  it('keeps the confirmation ID and its time, links the actual request attribute, and undoes the batch together', () => {
    const session = createModelSession({
      document: seed(),
      validateOnDispatch: true,
    });
    const before = session.getDocument();
    session.mutate(
      (draft) => splitEvidenceToPairMutator(draft, pairIntent()),
      'split',
    );
    const graph = createDomainGraph(session.getDocument());
    expect(
      graph
        .fulfillmentPair(split.request.id)
        ?.confirmations.map(({ id }) => id),
    ).toEqual([payment.id]);
    expect(graph.attribute(payment.id, 'paid_at')).toMatchObject(occurrences);
    expect(graph.attribute(payment.id, 'amount')?.source).toEqual({
      kind: 'preceding-evidence',
      entityRef: split.request.id,
      attribute: 'requested_amount',
    });
    expect(
      graph.attribute(split.request.id, 'requested_amount')?.source,
    ).toEqual({ kind: 'request-input' });
    expect(graph.attribute(split.request.id, 'expired_at')).toBeUndefined();
    session.undo();
    expect(session.getDocument()).toEqual(before);
  });

  it('rejects foreign and half-assigned pairs, but accepts provenance across contracts', () => {
    const model = seed();
    splitEvidenceToPairMutator(model, pairIntent());
    model.entities.push({ ...contractContext, id: 'context.other' });
    const request = model.entities.find(({ id }) => id === split.request.id)!;
    const confirmation = model.entities.find(({ id }) => id === payment.id)!;
    Object.assign(request, { contextRef: contractContext.id });
    expect(() => DomainModelDocumentSchema.parse(model)).toThrow('must share');
    Object.assign(confirmation, { contextRef: 'context.other' });
    expect(() => DomainModelDocumentSchema.parse(model)).toThrow('must share');
    model.relationships = [];
    expect(DomainModelDocumentSchema.safeParse(model).success).toBe(true);
    expect(() =>
      splitEvidenceToPairMutator(model, {
        evidenceRef: payment.id,
        request: { mode: 'reuse', ref: split.request.id },
      }),
    ).toThrow('不能跨合同');
  });

  it('anchors the entire pair and its compensation together without inventing an executable breach rule', () => {
    const model = seed();
    splitEvidenceToPairMutator(model, pairIntent());
    recordBreachOutcomeMutator(model, {
      requestRef: split.request.id,
      condition: '资金未能按约到账',
      outcome: {
        kind: 'compensation_pair',
        request: { id: 'request.refund', label: '退款申请' },
        confirmation: { id: 'evidence.refund', label: '退款确认' },
      },
    });
    expect(model.rules).toEqual([]);
    expect(model.relationships).toContainEqual(
      expect.objectContaining({
        flowKind: 'breach_compensation',
        sourceRef: 'request.refund',
        targetRef: split.request.id,
      }),
    );
    assignFulfillmentContextMutator(model, {
      requestRef: split.request.id,
      contextRef: contractContext.id,
    });
    expect(
      model.entities
        .filter(isEvidenceEntity)
        .map(({ contextRef }) => contextRef),
    ).toEqual(Array(4).fill(contractContext.id));
    expect(DomainModelDocumentSchema.safeParse(model).success).toBe(true);
  });

  it('promotes a fulfillment fact without supplying an unknown deadline or confirmation time', () => {
    const model = seed();
    batchAddEvidenceMutator(model, {
      evidences: [
        { id: 'evidence.delivery', label: '交货回执', stage: 'fulfillment' },
        { id: 'evidence.quote', label: '报价', stage: 'proposal' },
      ],
    });
    const session = createModelSession({
      document: model,
      validateOnDispatch: true,
    });
    const request = {
      mode: 'create' as const,
      id: 'request.delivery',
      label: '请求交货',
    };
    const before = session.getDocument();
    expect(() =>
      session.mutate(
        (draft) =>
          splitEvidenceToPairMutator(draft, {
            evidenceRef: 'evidence.quote',
            request,
          }),
        'invalid promotion',
      ),
    ).toThrow('履约阶段');
    expect(session.getDocument()).toBe(before);
    session.mutate(
      (draft) =>
        splitEvidenceToPairMutator(draft, {
          evidenceRef: 'evidence.delivery',
          request,
        }),
      'delivery pair',
    );
    const graph = createDomainGraph(session.getDocument());
    expect(graph.fulfillmentPair(request.id)?.confirmations).toEqual([
      expect.objectContaining({
        id: 'evidence.delivery',
        kind: 'fulfillment_confirmation',
        attributes: [],
      }),
    ]);
    expect(graph.attribute(request.id, 'expired_at')).toBeUndefined();
    expect(session.getDocument().rules).toEqual([]);
  });

  it('extends compensation one step at a time and closes a branch with a hand-off', () => {
    const model = seed();
    splitEvidenceToPairMutator(model, pairIntent());
    const session = createModelSession({
      document: model,
      validateOnDispatch: true,
    });
    session.mutate(
      (draft) =>
        recordBreachOutcomeMutator(draft, {
          requestRef: split.request.id,
          condition: '未按期到账',
          outcome: {
            kind: 'compensation_pair',
            request: { id: 'request.refund', label: '请求退款' },
            confirmation: { id: 'evidence.refund', label: '退款确认' },
          },
        }),
      'refund',
    );
    const escalation = {
      requestRef: 'request.refund',
      condition: '退款逾期',
      outcome: {
        kind: 'terminal_escalation' as const,
        remedyKind: 'arbitration' as const,
        handoff: { id: 'evidence.dispute', label: '移交仲裁' },
      },
    };
    const beforeEscalation = session.getDocument();
    session.mutate(
      (draft) => recordBreachOutcomeMutator(draft, escalation),
      'escalate',
    );
    const afterEscalation = session.getDocument();
    expect(afterEscalation.relationships).toContainEqual(
      expect.objectContaining({
        sourceRef: escalation.outcome.handoff.id,
        targetRef: escalation.requestRef,
        flowKind: 'escalation',
        terminalRemedyKind: 'arbitration',
      }),
    );
    expect(afterEscalation.rules).toEqual([]);
    expect(() =>
      session.mutate(
        (draft) =>
          recordBreachOutcomeMutator(draft, {
            ...escalation,
            condition: ' 退款逾期 ',
          }),
        'duplicate outcome',
      ),
    ).toThrow('已有处理分支');
    expect(() =>
      session.mutate(
        (draft) =>
          splitEvidenceToPairMutator(draft, {
            evidenceRef: escalation.outcome.handoff.id,
            request: { mode: 'reuse', ref: escalation.requestRef },
          }),
        'invalid hand-off promotion',
      ),
    ).toThrow('争议移交');
    expect(session.getDocument()).toBe(afterEscalation);
    session.mutate(
      (draft) =>
        assignFulfillmentContextMutator(draft, {
          requestRef: 'request.refund',
          contextRef: contractContext.id,
        }),
      'anchor branch',
    );
    expect(
      session
        .getDocument()
        .entities.filter(isEvidenceEntity)
        .map(({ contextRef }) => contextRef),
    ).toEqual(Array(5).fill(contractContext.id));
    session.undo();
    session.undo();
    expect(session.getDocument()).toEqual(beforeEscalation);
  });

  it('leaves missing sources undecided and does not treat a hypothesis as a fact', () => {
    const model = seed();
    bindKeyDataSourceMutator(model, {
      evidenceRef: payment.id,
      attribute: 'amount',
      decision: { kind: 'direct', source: { kind: 'result-fact' } },
    });
    bindKeyDataSourceMutator(model, {
      evidenceRef: payment.id,
      attribute: 'amount',
      decision: { kind: 'unknown' },
    });
    expect(
      createDomainGraph(model).attribute(payment.id, 'amount')?.source,
    ).toBeUndefined();
    expect(() =>
      recordBreachOutcomeMutator(model, {
        requestRef: 'request.unseen',
        condition: '超时',
        outcome: {
          kind: 'compensation_pair',
          request: { id: 'request.refund', label: '退款' },
          confirmation: { id: 'evidence.refund', label: '退款确认' },
        },
      }),
    ).toThrow('request.unseen');
  });
});

it('commits a terminal handoff and its playable branch together', async () => {
  const { createProcurementModel, createPaymentStory } = await import(
    '../testing/modelFixture.js'
  );
  const { createModelSession } = await import(
    '../session/createModelSession.js'
  );
  const model = createProcurementModel();
  model.stories.push(createPaymentStory());
  const session = createModelSession({ document: model });
  session.mutate((d) =>
    recordBreachOutcomeMutator(d, {
      requestRef: 'request.payment',
      condition: '未按期支付',
      forkSource: { storyId: 'payment', stepId: 'request' },
      outcome: {
        kind: 'terminal_escalation',
        remedyKind: 'arbitration',
        handoff: { id: 'evidence.handoff', label: '仲裁移交' },
      },
    }),
  );
  expect(session.getDocument().stories[1]).toMatchObject({
    kind: 'breach_branch',
    forkedFrom: { storyId: 'payment', stepId: 'request' },
    steps: [
      { workObjectRef: 'evidence.handoff', basedOn: ['payment#request'] },
    ],
  });
  expect(session.undo()).toBe(true);
  expect(session.getDocument()).toEqual(model);
});
