import { describe, expect, it } from 'vitest';
import {
  createEmptyDomainModel,
  type EntityAST,
} from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '../model/graph.js';
import { createModelSession } from '../session/createModelSession.js';
import {
  bindPartyRoleMutator,
  identifySubjectMatterMutator,
  linkProposalToRfpMutator,
} from './businessBindings.js';

const fixture = (): EntityAST[] => [
  {
    type: 'entity',
    category: 'context',
    kind: 'pre_contract',
    id: 'context.channel',
    label: '渠道',
  },
  {
    type: 'entity',
    category: 'context',
    kind: 'pre_contract',
    id: 'context.other',
    label: '其他渠道',
  },
  {
    type: 'entity',
    category: 'context',
    kind: 'domain',
    id: 'context.catalog',
    label: '商品目录',
  },
  {
    type: 'entity',
    category: 'context',
    kind: 'contract',
    id: 'context.sale',
    label: '买卖',
    rootRefs: ['contract.sale'],
  },
  {
    type: 'entity',
    category: 'evidence',
    kind: 'contract',
    id: 'contract.sale',
    label: '买卖合同',
    contextRef: 'context.sale',
  },
  {
    type: 'entity',
    category: 'evidence',
    kind: 'rfp',
    id: 'rfp.sale',
    label: '询价',
    contextRef: 'context.channel',
  },
  {
    type: 'entity',
    category: 'evidence',
    kind: 'proposal',
    id: 'proposal.sale',
    label: '报价',
    contextRef: 'context.channel',
  },
  {
    type: 'entity',
    category: 'evidence',
    kind: 'proposal',
    id: 'proposal.other',
    label: '其他报价',
    contextRef: 'context.other',
  },
  {
    type: 'entity',
    category: 'evidence',
    kind: 'fulfillment_request',
    id: 'request.delivery',
    label: '请求交货',
    contextRef: 'context.sale',
  },
  {
    type: 'entity',
    category: 'evidence',
    kind: 'fulfillment_confirmation',
    id: 'confirmation.delivery',
    label: '交货确认',
    contextRef: 'context.sale',
  },
  {
    type: 'entity',
    category: 'participant',
    kind: 'party',
    id: 'party.buyer',
    label: '采购商',
  },
];

const setup = () =>
  createModelSession({
    document: { ...createEmptyDomainModel(), entities: fixture() },
    validateOnDispatch: true,
  });

const link = { proposalRef: 'proposal.sale', rfpRef: 'rfp.sale' };

describe('business bindings', () => {
  it('links a proposal to its RFP only once, without creating a fulfillment item', () => {
    const session = setup();
    const before = session.getDocument();
    session.mutate((draft) => linkProposalToRfpMutator(draft, link), 'link');
    const after = session.getDocument();
    expect(after.relationships).toEqual([
      expect.objectContaining({
        kind: 'references',
        sourceRef: link.proposalRef,
        targetRef: link.rfpRef,
      }),
    ]);
    expect(after.entities).toEqual(before.entities);
    expect(after.rules).toEqual([]);
    session.mutate((draft) => linkProposalToRfpMutator(draft, link), 'repeat');
    expect(session.getDocument()).toBe(after);
    expect(() =>
      session.mutate(
        (draft) =>
          linkProposalToRfpMutator(draft, {
            ...link,
            proposalRef: 'proposal.other',
          }),
        'cross channel',
      ),
    ).toThrow('前期上下文');
    expect(session.getDocument()).toBe(after);
  });

  it('requires an existing domain and shares a thing across evidence from different contexts', () => {
    const session = setup();
    const create = {
      mode: 'create' as const,
      id: 'thing.goods',
      label: '商品',
      domainContextRef: 'context.catalog',
    };
    const before = session.getDocument();
    expect(() =>
      session.mutate(
        (draft) =>
          identifySubjectMatterMutator(draft, {
            evidenceRefs: ['proposal.sale'],
            subjectMatter: { ...create, domainContextRef: 'context.missing' },
          }),
        'unknown domain',
      ),
    ).toThrow('context.missing');
    expect(session.getDocument()).toBe(before);
    session.mutate(
      (draft) =>
        identifySubjectMatterMutator(draft, {
          evidenceRefs: ['proposal.sale', 'proposal.sale'],
          subjectMatter: create,
        }),
      'identify',
    );
    session.mutate(
      (draft) =>
        identifySubjectMatterMutator(draft, {
          evidenceRefs: ['proposal.sale', 'request.delivery'],
          subjectMatter: { mode: 'reuse', ref: create.id },
        }),
      'reuse',
    );
    const graph = createDomainGraph(session.getDocument());
    expect(graph.getEntity(create.id)).toMatchObject({
      category: 'participant',
      kind: 'thing',
      contextRef: 'context.catalog',
    });
    expect(graph.incoming(create.id).map(({ sourceRef }) => sourceRef)).toEqual(
      ['proposal.sale', 'request.delivery'],
    );
  });

  it('appends contract parties and binds evidence without overwriting responsibility', () => {
    const session = setup();
    const contextRef = 'context.sale';
    const before = session.getDocument();
    session.mutate(
      (draft) =>
        bindPartyRoleMutator(draft, {
          contextRef,
          partyRole: { mode: 'create', id: 'role.buyer', label: '买方' },
          participantRef: 'party.buyer',
          responsibleEvidenceRefs: ['request.delivery'],
        }),
      'bind buyer',
    );
    const buyer = session.getDocument();
    expect(() =>
      session.mutate(
        (draft) =>
          bindPartyRoleMutator(draft, {
            contextRef,
            partyRole: { mode: 'create', id: 'role.seller', label: '卖方' },
            responsibleEvidenceRefs: [
              'confirmation.delivery',
              'request.delivery',
            ],
          }),
        'conflicting responsibility',
      ),
    ).toThrow('已有责任角色');
    expect(session.getDocument()).toBe(buyer);
    session.mutate(
      (draft) =>
        bindPartyRoleMutator(draft, {
          contextRef,
          partyRole: { mode: 'create', id: 'role.seller', label: '卖方' },
          responsibleEvidenceRefs: ['confirmation.delivery'],
        }),
      'bind seller',
    );
    const graph = createDomainGraph(session.getDocument());
    expect(graph.rootContractOf(contextRef)?.roleRefs).toEqual([
      'role.buyer',
      'role.seller',
    ]);
    expect(graph.getEntity('request.delivery')).toMatchObject({
      responsibleRoleRef: 'role.buyer',
    });
    expect(graph.getEntity('confirmation.delivery')).toMatchObject({
      responsibleRoleRef: 'role.seller',
    });
    expect(graph.outgoing('party.buyer')).toEqual([
      expect.objectContaining({ kind: 'plays_role', targetRef: 'role.buyer' }),
    ]);
    expect(() =>
      session.mutate(
        (draft) =>
          bindPartyRoleMutator(draft, {
            contextRef,
            partyRole: { mode: 'create', id: 'role.third', label: '第三方' },
          }),
        'third party',
      ),
    ).toThrow('已有双方');
    session.undo();
    expect(session.getDocument()).toEqual(buyer);
    session.undo();
    expect(session.getDocument()).toEqual(before);
  });
});
