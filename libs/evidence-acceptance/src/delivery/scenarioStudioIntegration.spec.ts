import {
  createModelSession,
  forkStory,
  evaluateScenario,
  resolveStoryTraces,
} from '@evidence-poc/evidence-model-core';
import { createAcceptanceModel } from '@evidence-poc/evidence-api/testing';
import { projectAcceptanceTests } from './scenarioProjector.js';
import { renderBruno } from '../renderer/brunoRenderer.js';

describe('scenario studio to standard acceptance', () => {
  it('round trips forked stories through traces and Bruno export', () => {
    const session = createModelSession({ document: createAcceptanceModel() });
    const parent = session.getDocument().stories[0]!;
    session.mutate((d) =>
      forkStory(d, {
        id: 'branch',
        title: '采购分支',
        forkedFrom: { storyId: parent.id, stepId: 'requested' },
        steps: [
          {
            ...parent.steps[2]!,
            basedOn: ['payment#requested'],
            pathParameters: {
              paymentId: { stepRef: 'payment#requested', jsonpath: '$.id' },
            },
          },
        ],
      }),
    );
    const restored = JSON.parse(JSON.stringify(session.getDocument()));
    expect(resolveStoryTraces(restored)).toHaveLength(2);
    const oracle = evaluateScenario(restored, 'branch');
    expect(oracle.at(-1)?.values.total_amount).toBe(500);
    const projection = projectAcceptanceTests(restored);
    expect(projection.flows).toHaveLength(2);
    expect(projection.flows.every((f) => f.steps.length === 3)).toBe(true);
    const files = renderBruno(projection);
    expect(Object.values(files).join('\n')).toContain('eq 500');
    expect(
      Object.keys(files).filter((file) =>
        /^flows\/flow-\d+\/folder\.bru$/.test(file),
      ),
    ).toHaveLength(2);
    expect(session.undo()).toBe(true);
    expect(projectAcceptanceTests(session.getDocument()).flows).toHaveLength(1);
  });
});
