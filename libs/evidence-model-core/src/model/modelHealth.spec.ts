import { describe, expect, it } from 'vitest';
import {
  createEmptyDomainModel,
  type EntityAST,
  type RelationshipAST,
} from '@evidence-poc/evidence-schema';
import { createDomainGraph } from './graph.js';
import { inspectModelHealth } from './modelHealth.js';

const evidence = (
  id: string,
  kind: Extract<EntityAST, { category: 'evidence' }>['kind'],
  contextRef?: string,
) =>
  ({
    type: 'entity',
    category: 'evidence',
    id,
    label: id,
    kind,
    ...(contextRef && { contextRef }),
  }) as const;
const context = (
  id: string,
  kind: Extract<EntityAST, { category: 'context' }>['kind'],
  rootRefs?: string[],
) =>
  ({
    type: 'entity',
    category: 'context',
    id,
    label: id,
    kind,
    ...(rootRefs && { rootRefs }),
  }) as const;
const role = (id: string, kind: 'party' | 'evidence', contextRef: string) =>
  ({
    type: 'entity',
    category: 'role',
    id,
    label: id,
    kind,
    contextRef,
  }) as const;
const thing = (id: string) =>
  ({
    type: 'entity',
    category: 'participant',
    kind: 'thing',
    id,
    label: id,
    contextRef: 'context.catalog',
  }) as const;
const edge = (
  sourceRef: string,
  targetRef: string,
  extra?: Partial<RelationshipAST>,
): RelationshipAST => ({
  type: 'relationship',
  id: `relation.${sourceRef}-${targetRef}`,
  label: '关联',
  kind: 'references',
  sourceRef,
  targetRef,
  ...extra,
});
const time = (timeRole: 'start' | 'occurrence' | 'deadline') => ({
  name: `${timeRole}_at`,
  label: timeRole,
  meaning: timeRole,
  valueType: 'timestamp' as const,
  timeRole,
});
const scan = (
  entities: EntityAST[] = [],
  relationships: RelationshipAST[] = [],
) =>
  inspectModelHealth(
    createDomainGraph({ ...createEmptyDomainModel(), entities, relationships }),
  );

const request = {
  ...evidence('request.work', 'fulfillment_request', 'context.contract'),
  responsibleRoleRef: 'role.owner',
  attributes: [time('start'), time('deadline')],
};
const result = {
  ...evidence(
    'confirmation.work',
    'fulfillment_confirmation',
    'context.contract',
  ),
  responsibleRoleRef: 'role.worker',
  attributes: [time('occurrence')],
};
const contractContext = context('context.contract', 'contract', [
  'contract.work',
]);
const binding = edge(result.id, request.id);

const ids = (report: ReturnType<typeof scan>) =>
  report.issues.map(({ id }) => id);

describe('8X Flow health advisories', () => {
  it('does not score an empty board, channel responses or evidence notes', () => {
    const report = scan(
      [
        evidence('rfp.work', 'rfp'),
        evidence('proposal.work', 'proposal'),
        {
          ...evidence('evidence.note', 'other_evidence'),
          sourceSnippet: { text: '材料片段' },
        },
      ],
      [edge('proposal.work', 'rfp.work')],
    );
    expect(report).toEqual(scan());
    expect(report.overallScore).toBeNull();
    expect(report.issues).toEqual([]);
  });

  it('detects a missing timeout outcome even when a normal confirmation exists, and a later open compensation', () => {
    const comp = { ...request, id: 'request.compensation' };
    const handoff = evidence(
      'evidence.handoff',
      'other_evidence',
      'context.contract',
    );
    const first = [request, result];
    expect(ids(scan(first, [binding]))).toContain(
      'dead_end_request:request.work',
    );
    const chain = [...first, comp, handoff];
    const edges = [
      binding,
      edge(comp.id, request.id, { flowKind: 'breach_compensation' }),
    ];
    const findings = ids(scan(chain, edges));
    expect(findings).not.toContain('dead_end_request:request.work');
    expect(findings).toContain('unhedged_breach_chain:request.compensation');
    expect(
      ids(
        scan(chain, [
          ...edges,
          edge(handoff.id, comp.id, {
            flowKind: 'escalation',
            terminalRemedyKind: 'lawsuit',
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it('finds party, responsibility, time and pairing gaps without treating auxiliary proof as a confirmation', () => {
    const owner = role('role.owner', 'party', contractContext.id);
    const party: EntityAST = {
      type: 'entity',
      category: 'participant',
      kind: 'party',
      id: 'party.owner',
      label: '主体',
    };
    const contract = {
      ...evidence('contract.work', 'contract', contractContext.id),
      roleRefs: [owner.id],
    };
    const draft = evidence('confirmation.unbound', 'fulfillment_confirmation');
    const proof = evidence(
      'evidence.proof',
      'other_evidence',
      contractContext.id,
    );
    const entities = [
      contractContext,
      owner,
      party,
      contract,
      request,
      result,
      draft,
      proof,
    ];
    const edges = [binding, edge(proof.id, result.id)];
    expect(ids(scan(entities, edges))).toEqual([
      'dead_end_request:request.work',
      'vacant_responsibility:confirmation.unbound',
      'unbound_party_role:role.owner',
      'unpaired_fulfillment_stub:confirmation.unbound',
      'missing_subject_matter:request.work',
      'temporal_semantic_mismatch:confirmation.unbound',
    ]);
    expect(
      ids(
        scan(entities, [
          ...edges,
          edge(party.id, owner.id, { kind: 'plays_role' }),
        ]),
      ),
    ).not.toContain('unbound_party_role:role.owner');
  });

  it('distinguishes subjects from calculators and accepts a subject on a proof', () => {
    const proof = evidence(
      'evidence.proof',
      'other_evidence',
      contractContext.id,
    );
    const goods = thing('thing.goods');
    const unused = thing('thing.unused');
    const calculator = {
      ...thing('thing.calculator'),
      domainRole: 'calculator' as const,
    };
    const entities = [
      request,
      result,
      proof,
      goods,
      unused,
      calculator,
      contractContext,
    ];
    const report = scan(entities, [
      binding,
      edge(proof.id, result.id),
      edge(proof.id, goods.id),
    ]);
    expect(report.dimensions.boundary).toEqual({
      checks: 3,
      issueCount: 1,
      score: 67,
    });
    expect(ids(report)).toEqual([
      'dead_end_request:request.work',
      'orphan_subject_matter:thing.unused',
    ]);
  });

  it('reports cross-contract confirmation links as advice, and recognizes a bound capability socket', () => {
    const support = context('context.support', 'contract');
    const receipt = {
      ...result,
      id: 'confirmation.receipt',
      contextRef: support.id,
    };
    const socket = role('role.payment', 'evidence', contractContext.id);
    const direct = edge(result.id, receipt.id);
    const uses = edge(result.id, socket.id);
    const provides = edge(receipt.id, socket.id, { kind: 'plays_role' });
    const entities = [
      contractContext,
      support,
      request,
      result,
      receipt,
      socket,
    ];
    const before = scan(entities, [binding, direct, uses]);
    expect(
      before.issues.filter(({ dimension }) => dimension === 'variation'),
    ).toMatchObject([
      {
        code: 'direct_foreign_confirmation',
        severity: 'review',
        targetNodeId: result.id,
        relatedNodeIds: [receipt.id],
      },
      {
        code: 'unbound_role_socket',
        targetNodeId: socket.id,
        inquiry: { nodeId: result.id, kind: 'trace' },
      },
    ]);
    const after = scan(entities, [binding, provides, uses]);
    expect(after.dimensions.variation).toEqual({
      checks: 1,
      score: 100,
      issueCount: 0,
    });
    expect(after).toEqual(
      scan([...entities].reverse(), [uses, provides, binding]),
    );
  });
});
