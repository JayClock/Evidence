import { describe, expect, it } from 'vitest';
import {
  createDomainGraph,
  recordBreachOutcomeMutator,
} from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { storyFlow } from '@evidence-poc/desktop-testing/story';
import { stepRef, storyForks } from './storyForks';

describe('story forks', () => {
  it('keeps sibling outcomes on their example after reordering and preserves unscoped request outcomes', () => {
    const model = createDesktopFixture();
    const primary = storyFlow();
    const [, request, confirmation] = primary.steps;
    const reordered = {
      ...primary,
      steps: [
        primary.steps[0]!,
        request!,
        { ...request!, exampleLabel: '第二次交付', sequence: 3 },
        { ...confirmation!, sequence: 4 },
      ],
    };
    for (const [i, anchor] of [
      stepRef(confirmation!),
      stepRef(confirmation!),
      undefined,
    ].entries()) {
      recordBreachOutcomeMutator(model, {
        requestRef: request!.entityId,
        forkExampleRef: anchor,
        condition: `触发条件 ${i}`,
        outcome: {
          kind: 'terminal_escalation',
          remedyKind: 'lawsuit',
          handoff: { id: `handoff.case-${i}`, label: `移交 ${i}` },
        },
      });
    }
    const other = {
      ...storyFlow('另一条业务流'),
      steps: [{ ...request!, exampleLabel: '另一笔交付', sequence: 1 }],
    };
    const graph = createDomainGraph(model);
    const flows = [reordered, other];
    const forks = storyForks(graph, flows, reordered);
    expect(
      [...forks].map(([sequence, items]) => [
        sequence,
        items.map(({ outcome }) => outcome.edge.notes),
      ]),
    ).toEqual([
      [4, ['触发条件 0', '触发条件 1']],
      [2, ['触发条件 2']],
      [3, ['触发条件 2']],
    ]);
    expect(
      storyForks(graph, flows, other)
        .get(1)
        ?.map(({ outcome }) => outcome.edge.notes),
    ).toEqual(['触发条件 2']);
  });
});
