import { describe, expect, it } from 'vitest';
import {
  createEmptyDomainModel,
  DomainModelDocumentSchema,
} from './document.js';
import type { RelationshipFlowKind } from './relationship.js';

const channelModel = (
  proposalContext?: string,
  rfpContext?: string,
  flowKind?: RelationshipFlowKind,
) => {
  const model = createEmptyDomainModel();
  for (const id of ['context.web', 'context.store']) {
    model.entities.push({
      type: 'entity',
      category: 'context',
      kind: 'pre_contract',
      id,
      label: id,
    });
  }
  model.entities.push(
    {
      type: 'entity',
      category: 'evidence',
      kind: 'rfp',
      id: 'rfp.order',
      label: '询价',
      contextRef: rfpContext,
    },
    {
      type: 'entity',
      category: 'evidence',
      kind: 'proposal',
      id: 'proposal.order',
      label: '报价',
      contextRef: proposalContext,
    },
  );
  model.relationships.push({
    type: 'relationship',
    kind: 'references',
    id: 'relation.quote',
    sourceRef: 'proposal.order',
    targetRef: 'rfp.order',
    label: '回应询价',
    flowKind,
  });
  return model;
};

describe('channel responses', () => {
  it('accepts a quote answering an inquiry without a signed contract', () => {
    const model = channelModel('context.web', 'context.web');
    expect(DomainModelDocumentSchema.parse(model).rules).toEqual([]);
  });

  it('allows both sides to remain unassigned during drafting', () => {
    expect(DomainModelDocumentSchema.safeParse(channelModel()).success).toBe(
      true,
    );
  });

  it.each([undefined, 'context.store'])(
    'rejects a response with a different context (%s)',
    (context) => {
      expect(() =>
        DomainModelDocumentSchema.parse(channelModel(context, 'context.web')),
      ).toThrow('must share one Pre-contract Context');
    },
  );

  it.each(['breach_compensation', 'escalation'] as const)(
    'rejects treating a quote as %s',
    (flowKind) => {
      expect(() =>
        DomainModelDocumentSchema.parse(
          channelModel('context.web', 'context.web', flowKind),
        ),
      ).toThrow('not a breach response');
    },
  );
});
