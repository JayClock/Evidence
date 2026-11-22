import {
  BindPartyRoleInputSchema,
  IdentifySubjectMatterInputSchema,
  LinkProposalToRfpInputSchema,
  isEvidenceEntity,
  isParticipantEntity,
  type BindPartyRoleInput,
  type DomainModelDocument,
  type IdentifySubjectMatterInput,
  type LinkProposalToRfpInput,
  type RelationshipAST,
} from '@evidence-poc/evidence-schema';

import { createDomainGraph } from '../model/graph.js';
import { createEntityMutator } from './entityMutations.js';
import {
  requireContext,
  requireContractContext,
  requireEntity,
  requirePartyRole,
} from './guards.js';
import type { OperatorResult } from './operators.js';
import { createRelationshipMutator } from './relationshipMutations.js';

const addBinding = (
  draft: DomainModelDocument,
  createdIds: string[],
  edge: RelationshipAST,
) => {
  if (
    draft.relationships.some(
      (existing) =>
        existing.kind === edge.kind &&
        (existing.flowKind === undefined || existing.flowKind === 'primary') &&
        existing.sourceRef === edge.sourceRef &&
        existing.targetRef === edge.targetRef,
    )
  )
    return;
  createdIds.push(createRelationshipMutator(draft, edge).id);
};

/** Records an explicit channel response without creating a fulfillment item. */
export const linkProposalToRfpMutator = (
  draft: DomainModelDocument,
  input: LinkProposalToRfpInput,
): OperatorResult => {
  const { proposalRef, rfpRef } = LinkProposalToRfpInputSchema.parse(input);
  const proposal = requireEntity(draft, proposalRef);
  const rfp = requireEntity(draft, rfpRef);
  if (!isEvidenceEntity(proposal) || proposal.kind !== 'proposal')
    throw new Error(`${proposalRef} 不是报价或投标凭证。`);
  if (!isEvidenceEntity(rfp) || rfp.kind !== 'rfp')
    throw new Error(`${rfpRef} 不是询价或投标邀请凭证。`);
  const contextRef = proposal.contextRef;
  if (
    contextRef !== rfp.contextRef ||
    (contextRef !== undefined &&
      requireContext(draft, contextRef).kind !== 'pre_contract')
  )
    throw new Error('报价与询价必须同属一个前期上下文，或同时尚无归属。');

  const createdIds: string[] = [];
  addBinding(draft, createdIds, {
    type: 'relationship',
    id: `relation.${proposalRef}-responds-${rfpRef}`,
    kind: 'references',
    sourceRef: proposalRef,
    targetRef: rfpRef,
    label: '报价响应询价',
  });
  return { createdIds };
};

export const identifySubjectMatterMutator = (
  draft: DomainModelDocument,
  input: IdentifySubjectMatterInput,
): OperatorResult => {
  const { evidenceRefs, subjectMatter } =
    IdentifySubjectMatterInputSchema.parse(input);
  for (const ref of evidenceRefs) {
    if (!isEvidenceEntity(requireEntity(draft, ref)))
      throw new Error(`${ref} 不是业务凭证。`);
  }
  const createdIds: string[] = [];
  const thingRef =
    subjectMatter.mode === 'create' ? subjectMatter.id : subjectMatter.ref;
  if (subjectMatter.mode === 'create') {
    createEntityMutator(draft, {
      type: 'entity',
      id: thingRef,
      label: subjectMatter.label,
      category: 'participant',
      kind: 'thing',
      contextRef: subjectMatter.domainContextRef,
    });
    createdIds.push(thingRef);
  } else {
    const thing = requireEntity(draft, thingRef);
    if (!isParticipantEntity(thing) || thing.kind !== 'thing')
      throw new Error(`${thingRef} 不是业务标的物。`);
  }
  for (const ref of new Set(evidenceRefs)) {
    addBinding(draft, createdIds, {
      type: 'relationship',
      id: `relation.${ref}-concerns-${thingRef}`,
      kind: 'references',
      sourceRef: ref,
      targetRef: thingRef,
      label: '凭证涉及标的物',
    });
  }
  return { createdIds };
};

/** Binds a known contract role without inferring its player or replacing a party. */
export const bindPartyRoleMutator = (
  draft: DomainModelDocument,
  input: BindPartyRoleInput,
): OperatorResult => {
  const { contextRef, partyRole, participantRef, responsibleEvidenceRefs } =
    BindPartyRoleInputSchema.parse(input);
  requireContractContext(draft, contextRef);
  const roleRef = partyRole.mode === 'create' ? partyRole.id : partyRole.ref;
  if (
    partyRole.mode === 'reuse' &&
    requirePartyRole(draft, roleRef).contextRef !== contextRef
  )
    throw new Error(`${roleRef} 不属于合同上下文 ${contextRef}。`);
  if (participantRef !== undefined) {
    const party = requireEntity(draft, participantRef);
    if (!isParticipantEntity(party) || party.kind !== 'party')
      throw new Error(`${participantRef} 不是全局参与方。`);
  }
  const contract = createDomainGraph(draft).rootContractOf(contextRef);
  const roleRefs = contract?.roleRefs ?? [];
  if (roleRefs.length >= 2 && !roleRefs.includes(roleRef))
    throw new Error('根合同已有双方当事人角色，不新增或覆盖。');
  const evidences = [...new Set(responsibleEvidenceRefs)].map((ref) => {
    const evidence = requireEntity(draft, ref);
    if (
      !isEvidenceEntity(evidence) ||
      evidence.kind === 'contract' ||
      evidence.contextRef !== contextRef
    )
      throw new Error(`${ref} 不是该合同内可绑定责任的凭证。`);
    if (
      evidence.responsibleRoleRef !== undefined &&
      evidence.responsibleRoleRef !== roleRef
    )
      throw new Error(`${ref} 已有责任角色，不覆盖。`);
    return evidence;
  });
  const createdIds: string[] = [];
  if (partyRole.mode === 'create') {
    createEntityMutator(draft, {
      type: 'entity',
      id: roleRef,
      label: partyRole.label,
      category: 'role',
      kind: 'party',
      contextRef,
    });
    createdIds.push(roleRef);
  }
  if (participantRef !== undefined) {
    addBinding(draft, createdIds, {
      type: 'relationship',
      id: `relation.${participantRef}-plays-${roleRef}`,
      kind: 'plays_role',
      sourceRef: participantRef,
      targetRef: roleRef,
      label: '参与方扮演合同当事人角色',
    });
  }
  if (contract !== undefined && !roleRefs.includes(roleRef))
    contract.roleRefs = [...roleRefs, roleRef];
  for (const evidence of evidences) evidence.responsibleRoleRef = roleRef;
  return { createdIds };
};
