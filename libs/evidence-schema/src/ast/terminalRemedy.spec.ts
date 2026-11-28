import { describe, expect, it } from 'vitest';
import {
  createEmptyDomainModel,
  DomainModelDocumentSchema,
} from './document.js';
import { RelationshipASTSchema } from './relationship.js';
import { RecordBreachOutcomeInputSchema } from '../tools/evidenceGrowthInputs.js';

const edge = {
  type: 'relationship',
  kind: 'references',
  flowKind: 'escalation',
  terminalRemedyKind: 'lawsuit',
  id: 'relation.handoff',
  sourceRef: 'evidence.handoff',
  targetRef: 'request.refund',
  label: '移交法务',
} as const;

const modelWithHandoff = () => {
  const model = createEmptyDomainModel();
  model.entities.push(
    {
      type: 'entity',
      category: 'evidence',
      kind: 'other_evidence',
      id: edge.sourceRef,
      label: '诉讼移交记录',
    },
    {
      type: 'entity',
      category: 'evidence',
      kind: 'fulfillment_request',
      id: edge.targetRef,
      label: '退款请求',
    },
  );
  model.relationships.push({ ...edge });
  return model;
};

const terminalIntent = {
  requestRef: edge.targetRef,
  condition: '退款仍未到账',
  outcome: {
    kind: 'terminal_escalation',
    remedyKind: 'lawsuit',
    handoff: { id: edge.sourceRef, label: '移交法务' },
  },
};

describe('terminal breach outcomes', () => {
  it('accepts a story anchor in the outcome intent', () => {
    const forkSource = { storyId: 'payment', stepId: 'second-payment' };
    expect(
      RecordBreachOutcomeInputSchema.parse({ ...terminalIntent, forkSource })
        .forkSource,
    ).toEqual(forkSource);
  });
  it('accepts a hand-off record without requiring a litigation fulfillment pair', () => {
    const model = modelWithHandoff();
    expect(DomainModelDocumentSchema.parse(model)).toEqual(model);
  });

  it('rejects terminal metadata on ordinary links', () => {
    for (const flowKind of [undefined, 'primary', 'breach_compensation']) {
      expect(
        RelationshipASTSchema.safeParse({ ...edge, flowKind }).success,
      ).toBe(false);
    }
    expect(
      RelationshipASTSchema.safeParse({ ...edge, kind: 'plays_role' }).success,
    ).toBe(false);
  });

  it('rejects linking a terminal hand-off to anything but the failed request', () => {
    const model = modelWithHandoff();
    model.relationships[0] = {
      ...edge,
      sourceRef: edge.targetRef,
      targetRef: edge.sourceRef,
    };
    expect(() => DomainModelDocumentSchema.parse(model)).toThrow(
      'breached Fulfillment Request',
    );
  });

  it('requires one outcome and rejects the previous untagged input or mixed payload', () => {
    expect(RecordBreachOutcomeInputSchema.parse(terminalIntent)).toEqual(
      terminalIntent,
    );
    const { outcome, ...base } = terminalIntent;
    expect(
      RecordBreachOutcomeInputSchema.safeParse({
        ...base,
        request: outcome.handoff,
        confirmation: outcome.handoff,
      }).success,
    ).toBe(false);
    expect(
      RecordBreachOutcomeInputSchema.safeParse({
        ...base,
        outcome: { ...outcome, confirmation: outcome.handoff },
      }).success,
    ).toBe(false);
  });
});
