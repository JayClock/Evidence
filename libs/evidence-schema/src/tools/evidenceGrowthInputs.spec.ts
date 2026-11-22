import { describe, expect, it } from 'vitest';
import {
  BindPartyRoleInputSchema,
  IdentifySubjectMatterInputSchema,
  LinkProposalToRfpInputSchema,
} from './evidenceGrowthInputs.js';

const evidenceRefs = ['evidence.quote'];

describe('business modeling inputs', () => {
  it('links existing negotiation records without asking for a fulfillment or a contract', () => {
    const intent = { proposalRef: 'proposal.order', rfpRef: 'rfp.order' };
    expect(LinkProposalToRfpInputSchema.parse(intent)).toEqual(intent);
    expect(
      LinkProposalToRfpInputSchema.safeParse({
        ...intent,
        requestRef: 'request.order',
      }).success,
    ).toBe(false);
  });

  it('anchors a new subject to a domain or reuses an existing Thing', () => {
    const thing = {
      mode: 'create',
      id: 'thing.product',
      label: '商品',
      domainContextRef: 'context.catalog',
    };
    expect(
      IdentifySubjectMatterInputSchema.parse({
        evidenceRefs,
        subjectMatter: thing,
      }).subjectMatter,
    ).toEqual(thing);
    const reuse = { mode: 'reuse', ref: thing.id };
    expect(
      IdentifySubjectMatterInputSchema.parse({
        evidenceRefs,
        subjectMatter: reuse,
      }).subjectMatter,
    ).toEqual(reuse);
    expect(
      IdentifySubjectMatterInputSchema.safeParse({
        evidenceRefs: [],
        subjectMatter: thing,
      }).success,
    ).toBe(false);
    expect(
      IdentifySubjectMatterInputSchema.safeParse({
        evidenceRefs,
        subjectMatter: { ...thing, domainContextRef: undefined },
      }).success,
    ).toBe(false);
    expect(
      IdentifySubjectMatterInputSchema.safeParse({
        evidenceRefs,
        subjectMatter: { ...thing, domainRole: 'calculator' },
      }).success,
    ).toBe(false);
  });

  it('distinguishes the contract duty from the Party playing the role', () => {
    const role = { mode: 'create', id: 'role.buyer', label: '买家' };
    const input = {
      contextRef: 'context.purchase',
      partyRole: role,
      participantRef: 'party.buyer',
      responsibleEvidenceRefs: ['request.payment'],
    };
    expect(BindPartyRoleInputSchema.parse(input)).toEqual(input);
    expect(
      BindPartyRoleInputSchema.safeParse({
        ...input,
        partyRole: { mode: 'reuse', label: role.label },
      }).success,
    ).toBe(false);
  });
});
