import {
  createPaymentStory,
  createProcurementModel,
} from '../testing/modelFixture.js';
import { createModelSession } from '../session/createModelSession.js';
import { deleteEntityMutator } from '../mutations/entityMutations.js';
import { removeAttributeMutator } from '../mutations/attributeMutations.js';
import { deleteRuleMutator } from '../mutations/ruleMutations.js';
import {
  createStory,
  deleteStory,
  forkStory,
  removeStoryStep,
  reorderStorySteps,
  updateStoryMeta,
  upsertStoryStep,
} from '../mutations/storyMutations.js';
import { evaluateScenario } from './scenarioStudio.js';

it('evaluates inherited facts, late confirmation, and missing or inconsistent oracle inputs', () => {
  const model = createProcurementModel(),
    story = createPaymentStory();
  createStory(model, story);
  const result = evaluateScenario(model, story.id);
  expect(result[0].values.total_minor_units).toBe(200);
  expect(
    result[2].rules.find((rule) => rule.ruleRef === 'rule.payment-completed')
      ?.value,
  ).toBe(true);
  const late = '2026-01-01T02:00:00Z';
  forkStory(model, {
    id: 'late',
    title: '逾期付款',
    forkedFrom: { storyId: story.id, stepId: 'request' },
    steps: [
      {
        ...story.steps[2],
        asOf: late,
        basedOn: ['payment#request'],
        values: { ...story.steps[2].values, confirmed_at: late },
      },
    ],
  });
  expect(
    evaluateScenario(model, 'late')[2].rules.find(
      (r) => r.ruleRef === 'rule.payment-completed',
    )?.value,
  ).toBe(false);
  const first = {
    ...story.steps[0],
    values: { ...story.steps[0].values, total_minor_units: 999 },
  };
  upsertStoryStep(model, story.id, first);
  expect(evaluateScenario(model, 'late')[0].gaps.join()).toContain('不一致');
  upsertStoryStep(model, story.id, { ...first, values: {} });
  expect(evaluateScenario(model, 'late')[0].gaps.join()).toContain('采购数量');
  expect(evaluateScenario(model, 'absent')).toEqual([]);
});
it('rolls back broken dependencies and fork anchors and records edits in session history', () => {
  const session = createModelSession({ document: createProcurementModel() }),
    story = createPaymentStory();
  session.mutate((d) => createStory(d, story));
  session.mutate((d) =>
    forkStory(d, {
      id: 'child',
      title: '子故事',
      forkedFrom: {
        storyId: story.id,
        stepId: 'confirm',
        triggerRuleRef: 'rule.payment-completed',
      },
      steps: [{ ...story.steps[2], basedOn: ['payment#confirm'] }],
    }),
  );
  const before = session.getDocument();
  for (const op of [
    (d: typeof before) => deleteStory(d, story.id),
    (d: typeof before) => removeStoryStep(d, story.id, 'confirm'),
    (d: typeof before) =>
      deleteEntityMutator(d, 'confirmation.payment', { cascade: true }),
    (d: typeof before) =>
      removeAttributeMutator(d, 'confirmation.payment', 'paid_minor_units', {
        cascade: true,
      }),
    (d: typeof before) =>
      deleteRuleMutator(d, 'rule.payment-completed', { cascade: true }),
    (d: typeof before) =>
      reorderStorySteps(d, story.id, ['confirm', 'request', 'sign']),
  ]) {
    expect(() => session.mutate(op)).toThrow();
    expect(session.getDocument()).toBe(before);
  }
  session.mutate((d) => updateStoryMeta(d, 'child', { title: '逾期' }));
  expect(session.undo()).toBe(true);
  expect(session.getDocument().stories[1].title).toBe('子故事');
  expect(session.redo()).toBe(true);
  expect(session.getDocument().stories[1].title).toBe('逾期');
  session.mutate((d) => deleteStory(d, 'child'));
  session.mutate((d) => removeStoryStep(d, story.id, 'confirm'));
  expect(session.getDocument().stories[0].steps).toHaveLength(2);
});
