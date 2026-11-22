import { describe, expect, it } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import {
  diffDomainModels,
  identifySubjectMatterMutator,
  recordBreachOutcomeMutator,
} from '@evidence-poc/evidence-model-core';
import { describeBusinessChanges } from './patchBusinessChanges';

const describeDelta = (
  before: ReturnType<typeof createDesktopFixture>,
  after: ReturnType<typeof createDesktopFixture>,
) => describeBusinessChanges(diffDomainModels(before, after), after);

describe('patch business changes', () => {
  it('reports a link to an existing subject, but not a new name for the same link', () => {
    const before = createDesktopFixture();
    before.entities.push({
      type: 'entity',
      category: 'participant',
      kind: 'thing',
      id: 'thing.goods',
      label: '采购商品',
      contextRef: 'context.catalog',
    });
    const after = structuredClone(before);
    identifySubjectMatterMutator(after, {
      evidenceRefs: ['evidence.confirmation'],
      subjectMatter: { mode: 'reuse', ref: 'thing.goods' },
    });
    expect(describeDelta(before, after)).toEqual(['subjectMatter']);
    const renamed = structuredClone(after);
    renamed.relationships.find(
      ({ targetRef }) => targetRef === 'thing.goods',
    )!.label = '标的说明';
    expect(describeDelta(after, renamed)).toEqual([]);
  });

  it('distinguishes an explicit remedy endpoint from an untyped escalation', () => {
    const initial = createDesktopFixture();
    const typed = structuredClone(initial);
    recordBreachOutcomeMutator(typed, {
      requestRef: 'evidence.request',
      condition: '争议经协商未解决',
      outcome: {
        kind: 'terminal_escalation',
        remedyKind: 'arbitration',
        handoff: { id: 'evidence.handoff', label: '移交仲裁' },
      },
    });
    const untyped = structuredClone(typed);
    delete untyped.relationships.find(
      ({ flowKind }) => flowKind === 'escalation',
    )!.terminalRemedyKind;
    expect(describeDelta(initial, untyped)).toEqual(['escalation']);
    expect(describeDelta(untyped, typed)).toEqual(['terminalRemedy']);
  });
});
