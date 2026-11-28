import { describe, expect, it, vi } from 'vitest';
import {
  createDomainGraph,
  keyDataEntryOf,
  createModelSession,
} from '@evidence-poc/evidence-model-core';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import {
  createModelTools,
  MODEL_TOOL_NAMES as names,
  type ModelPatchRequest,
  type ModelPatchResult,
} from './index.js';

const payment = {
  id: 'evidence.payment',
  label: '付款确认',
  stage: 'fulfillment',
  keyData: [
    {
      name: 'amount',
      label: '金额',
      meaning: '申请所列金额',
      valueType: 'int',
    },
    { name: 'receipt_no', label: '回执编号', meaning: '支付成功时生成的编号' },
  ],
};
const setup = () => {
  const session = createModelSession({
    document: createEmptyDomainModel(),
    validateOnDispatch: true,
  });
  const loadDocument = vi.fn(async () => session.getDocument());
  const applyModelPatch = vi.fn(
    async (patch: ModelPatchRequest): Promise<ModelPatchResult> => {
      try {
        session.applyPatchBatch(patch.patches, patch.rationale);
        return {
          success: true,
          appliedCommands: patch.patches.map(({ op }) => op),
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );
  const tools = createModelTools({ loadDocument, applyModelPatch });
  const tool = (name: string) =>
    tools.find((candidate) => candidate.name === name)!;
  return { session, tools, tool, loadDocument, applyModelPatch };
};

describe('shared model tool registry', () => {
  it('shares read-only What-If and health inspection', () => {
    const { tools, tool } = setup();
    expect(tools.map(({ name }) => name)).toEqual(Object.values(names));
    for (const name of [
      names.simulateWhatIfChallenge,
      names.scanModelHealth,
      names.listBusinessArchetypes,
      names.inspectArchetypeDetail,
      names.inspectContextMapTopology,
    ])
      expect(tool(name).annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
    expect(
      tools.filter(({ annotations }) => annotations.readOnlyHint),
    ).toHaveLength(5);
  });

  it('instantiates in a single guarded transaction and immediately projects the new topology', async () => {
    const { tool, session, loadDocument, applyModelPatch } = setup();
    expect(
      (await tool(names.listBusinessArchetypes).run({})).value,
    ).toHaveLength(3);
    const archetypeId = 'back-to-back-consignment';
    expect(
      (await tool(names.inspectArchetypeDetail).run({ archetypeId })).value,
    ).toMatchObject({ id: archetypeId });
    expect(loadDocument).not.toHaveBeenCalled();
    const before = session.getDocument();
    const input = {
      archetypeId,
      idPrefix: 'shop',
      variationValues: {
        subjectLabel: '商品',
        customerLabel: '顾客',
        operatorLabel: '商店',
        providerLabel: '供货方',
      },
    };
    expect(
      (await tool(names.instantiateArchetypeTemplate).run(input)).isError,
    ).toBeUndefined();
    expect(applyModelPatch).toHaveBeenCalledTimes(1);
    expect(applyModelPatch.mock.calls[0]?.[0].patches[0]).toEqual({
      op: 'test',
      path: '',
      value: before,
    });
    expect(
      (await tool(names.inspectContextMapTopology).run({})).value,
    ).toMatchObject({
      edges: expect.arrayContaining([
        expect.objectContaining({
          kind: 'capability',
          targetRef: 'shop.support.context',
        }),
      ]),
    });
    expect(
      (await tool(names.instantiateArchetypeTemplate).run(input)).isError,
    ).toBe(true);
    expect(applyModelPatch).toHaveBeenCalledTimes(1);
    session.undo();
    expect(session.getDocument()).toEqual(before);
  });

  it('scans the current model read-only and can recheck one finding', async () => {
    const { session, tool, applyModelPatch } = setup();
    const scan = tool(names.scanModelHealth);
    const id = 'request.payment';
    session.applyPatchBatch(
      [
        {
          op: 'add',
          path: '/entities/-',
          value: {
            type: 'entity',
            category: 'evidence',
            kind: 'fulfillment_request',
            id,
            label: '付款请求',
          },
        },
      ],
      '建立付款请求',
    );
    const result = await scan.run({ limit: 1 });
    expect(result.value).toMatchObject({
      totalIssueCount: 3,
      matchedIssueCount: 3,
      issues: [{ id: `vacant_responsibility:${id}`, targetNodeId: id }],
    });
    expect(
      (await scan.run({ issueId: `temporal_semantic_mismatch:${id}` })).value,
    ).toMatchObject({
      matchedIssueCount: 1,
      issues: [{ code: 'temporal_semantic_mismatch' }],
    });
    session.undo();
    expect(
      (await scan.run({ issueId: `vacant_responsibility:${id}` })).value,
    ).toMatchObject({
      matchedIssueCount: 0,
      overallScore: null,
      issues: [],
    });
    expect(applyModelPatch).not.toHaveBeenCalled();
  });

  it('rejects malformed inputs before any host operation', async () => {
    const { tools, loadDocument, applyModelPatch } = setup();
    for (const tool of tools)
      await expect(tool.run({ unexpected: true })).rejects.toThrow();
    expect(loadDocument).not.toHaveBeenCalled();
    expect(applyModelPatch).not.toHaveBeenCalled();
  });

  it('rejects material metadata in a storming batch before reading or writing', async () => {
    const { tool, loadDocument, applyModelPatch } = setup();
    await expect(
      tool(names.batchAddEvidence).run({
        evidences: [{ ...payment, sourceSnippet: '示例摘录' }],
      }),
    ).rejects.toThrow();
    expect(loadDocument).not.toHaveBeenCalled();
    expect(applyModelPatch).not.toHaveBeenCalled();
  });

  it('records channel responses and subject/party links through the shared registry', async () => {
    const { tool, session, applyModelPatch } = setup();
    session.mutate((draft) => {
      draft.entities.push(
        {
          type: 'entity',
          category: 'context',
          kind: 'contract',
          id: 'context.sale',
          label: '买卖',
        },
        {
          type: 'entity',
          category: 'context',
          kind: 'domain',
          id: 'context.catalog',
          label: '目录',
        },
        {
          type: 'entity',
          category: 'participant',
          kind: 'party',
          id: 'party.buyer',
          label: '买家',
        },
      );
    }, '准备上下文');
    const run = async (name: string, input: unknown) =>
      expect((await tool(name).run(input)).isError).toBeUndefined();
    await run(names.batchAddEvidence, {
      evidences: [
        { id: 'rfp.sale', stage: 'rfp', label: '询价' },
        { id: 'proposal.sale', stage: 'proposal', label: '报价' },
      ],
    });
    await run(names.linkProposalToRfp, {
      proposalRef: 'proposal.sale',
      rfpRef: 'rfp.sale',
    });
    await run(names.identifySubjectMatter, {
      evidenceRefs: ['proposal.sale'],
      subjectMatter: {
        mode: 'create',
        id: 'thing.item',
        label: '商品',
        domainContextRef: 'context.catalog',
      },
    });
    await run(names.bindPartyRole, {
      contextRef: 'context.sale',
      partyRole: { mode: 'create', id: 'role.buyer', label: '买方' },
      participantRef: 'party.buyer',
    });
    const graph = createDomainGraph(session.getDocument());
    expect(graph.preContractPairs()[0]?.proposals[0]?.id).toBe('proposal.sale');
    expect(graph.fulfillmentPairs()).toEqual([]);
    expect(graph.subjectMattersOf('proposal.sale')[0]?.contextRef).toBe(
      'context.catalog',
    );
    expect(graph.outgoing('party.buyer')).toMatchObject([
      { kind: 'plays_role', targetRef: 'role.buyer' },
    ]);
    expect(applyModelPatch).toHaveBeenCalledTimes(4);
    expect(session.undo()).toBe(true);
    expect(
      session.getDocument().entities.some(({ id }) => id === 'role.buyer'),
    ).toBe(false);
  });

  it('grows the same graph through storming, source decisions, pairing and confirmed compensation', async () => {
    const { tool, session, applyModelPatch } = setup();
    const run = async (name: string, input: unknown) =>
      expect((await tool(name).run(input)).isError).toBeUndefined();
    await run(names.batchAddEvidence, {
      evidences: [
        payment,
        { id: 'contract.sale', stage: 'contract', label: '买卖合同' },
      ],
    });
    const entry = (attribute: string) =>
      keyDataEntryOf(session.getDocument(), payment.id, attribute);
    expect(entry('receipt_no')?.decisionOwed).toBe(true);
    expect(entry('amount')?.decisionOwed).toBe(true);
    await run(names.bindKeyDataSource, {
      evidenceRef: payment.id,
      attribute: 'receipt_no',
      decision: { kind: 'direct', source: { kind: 'result-fact' } },
    });
    expect(entry('receipt_no')).toMatchObject({
      source: 'result-fact',
      decisionOwed: false,
    });
    await run(names.splitEvidenceToPair, {
      evidenceRef: payment.id,
      request: { mode: 'create', id: 'request.payment', label: '付款申请' },
      inputAttributes: [
        {
          confirmationAttribute: 'amount',
          requestAttribute: 'requested_amount',
        },
      ],
    });
    expect(entry('amount')).toMatchObject({
      source: 'preceding-evidence',
      decisionOwed: false,
      providers: [
        expect.objectContaining({
          ref: 'request.payment',
          attribute: 'requested_amount',
        }),
      ],
    });
    const beforeProbe = session.getDocument();
    const challenge = await tool(names.simulateWhatIfChallenge).run({
      requestRef: 'request.payment',
    });
    expect(challenge.value).toMatchObject({
      requestRef: 'request.payment',
      hypotheses: expect.arrayContaining([
        expect.objectContaining({ kind: 'timeout' }),
      ]),
    });
    expect(session.getDocument()).toBe(beforeProbe);
    expect(applyModelPatch).toHaveBeenCalledTimes(3);
    await run(names.recordBreachOutcome, {
      requestRef: 'request.payment',
      condition: '超时后启动退款',
      outcome: {
        kind: 'compensation_pair',
        request: { id: 'request.refund', label: '退款请求' },
        confirmation: { id: 'confirmation.refund', label: '退款确认' },
      },
    });
    await run(names.recordBreachOutcome, {
      requestRef: 'request.refund',
      condition: '退款仍未按约处理',
      outcome: {
        kind: 'terminal_escalation',
        remedyKind: 'arbitration',
        handoff: { id: 'evidence.handoff', label: '移交仲裁' },
      },
    });
    expect(session.getDocument().relationships).toContainEqual(
      expect.objectContaining({
        flowKind: 'escalation',
        terminalRemedyKind: 'arbitration',
        sourceRef: 'evidence.handoff',
        targetRef: 'request.refund',
      }),
    );
    expect(
      createDomainGraph(session.getDocument()).fulfillmentPair(
        'evidence.handoff',
      ),
    ).toBeUndefined();
    expect(
      session.getDocument().rules.filter(({ kind }) => kind === 'breach'),
    ).toEqual([]);
    expect(
      createDomainGraph(session.getDocument()).fulfillmentPair('request.refund')
        ?.confirmations[0]?.id,
    ).toBe('confirmation.refund');
    expect(session.getDocument().relationships).toContainEqual(
      expect.objectContaining({
        flowKind: 'breach_compensation',
        targetRef: 'request.payment',
      }),
    );
    const afterRemedy = session.getDocument();
    const probe = await tool(names.simulateWhatIfChallenge).run({
      requestRef: 'request.payment',
    });
    expect(probe.value).toMatchObject({
      breachChain: [
        {
          requestRef: 'request.payment',
          branches: [
            { kind: 'compensation_pair', requestRef: 'request.refund' },
          ],
        },
        {
          requestRef: 'request.refund',
          branches: [
            {
              kind: 'terminal_escalation',
              remedyKind: 'arbitration',
              handoffRef: 'evidence.handoff',
            },
          ],
        },
      ],
    });
    expect(session.getDocument()).toBe(afterRemedy);
    expect(applyModelPatch).toHaveBeenCalledTimes(5);
    expect(session.undo()).toBe(true);
    expect(
      createDomainGraph(session.getDocument()).getEntity('evidence.handoff'),
    ).toBeUndefined();
    expect(session.undo()).toBe(true);
    expect(session.getDocument()).toEqual(beforeProbe);
  });

  it('can explore a known request before a confirmation is modeled', async () => {
    const { tool, session, applyModelPatch } = setup();
    session.mutate((draft) => {
      draft.entities.push({
        type: 'entity',
        category: 'evidence',
        kind: 'fulfillment_request',
        id: 'request.delivery',
        label: '交货请求',
      });
    }, '已有请求');
    const probe = tool(names.simulateWhatIfChallenge);
    expect(await probe.run({ requestRef: 'request.delivery' })).toMatchObject({
      value: {
        confirmations: [],
        breachChain: [{ requestRef: 'request.delivery', branches: [] }],
      },
    });
    expect(await probe.run({ requestRef: 'request.missing' })).toMatchObject({
      isError: true,
    });
    expect(applyModelPatch).not.toHaveBeenCalled();
  });

  it('does not write a partially invalid batch or overwrite a stale host snapshot', async () => {
    const { tool, session, applyModelPatch } = setup();
    const refused = await tool(names.batchAddEvidence).run({
      evidences: [payment, payment],
    });
    expect(refused.isError).toBe(true);
    expect(applyModelPatch).not.toHaveBeenCalled();
    const persist = applyModelPatch.getMockImplementation()!;
    applyModelPatch.mockImplementationOnce(async (patch) => {
      session.mutate((draft) => {
        draft.manifest.name = '手工修改';
      });
      return persist(patch);
    });
    const rejected = await tool(names.batchAddEvidence).run({
      evidences: [payment],
    });
    expect(rejected.isError).toBe(true);
    expect(session.getDocument().entities).toEqual([]);
    expect(session.getDocument().manifest.name).toBe('手工修改');
  });
});

it('applies story tools through the host patch and history boundary', async () => {
  const { session, tool } = setup();
  session.mutate((d) => {
    d.entities.push(
      {
        type: 'entity',
        category: 'context',
        kind: 'contract',
        id: 'context.work',
        label: '工作',
      },
      {
        type: 'entity',
        category: 'role',
        kind: 'party',
        id: 'role.owner',
        label: '经办方',
        contextRef: 'context.work',
      },
      {
        type: 'entity',
        category: 'evidence',
        kind: 'other_evidence',
        id: 'evidence.receipt',
        label: '回执',
      },
    );
  });
  const step = {
    id: 'record',
    sequence: 1,
    activity: '登记',
    workObjectRef: 'evidence.receipt',
    actorRef: 'role.owner',
    asOf: '2026-01-01T00:00:00Z',
    values: {},
    basedOn: [],
  };
  await tool(names.createStory).run({
    story: {
      type: 'story',
      kind: 'primary',
      id: 'normal',
      title: '登记',
      steps: [step],
    },
  });
  await tool(names.upsertStoryStep).run({
    storyId: 'normal',
    step: { ...step, activity: '核对' },
  });
  await tool(names.forkStory).run({
    id: 'review',
    title: '复核',
    forkedFrom: { storyId: 'normal', stepId: 'record' },
    steps: [{ ...step, basedOn: ['normal#record'] }],
  });
  expect(session.getDocument().stories.map((s) => s.id)).toEqual([
    'normal',
    'review',
  ]);
  expect(
    (await tool(names.deleteStory).run({ storyId: 'normal' })).isError,
  ).toBe(true);
  await tool(names.deleteStory).run({ storyId: 'review' });
  expect(session.getDocument().stories[0].steps[0].activity).toBe('核对');
  expect(session.undo()).toBe(true);
  expect(session.getDocument().stories).toHaveLength(2);
});
