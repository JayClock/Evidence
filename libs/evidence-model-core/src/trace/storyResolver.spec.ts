import {
  createPaymentStory,
  createProcurementModel,
} from '../testing/modelFixture.js';
import {
  computeStepHash,
  resolveStoryTraces,
  resolveStorySteps,
} from './storyResolver.js';
import { createStory, forkStory } from '../mutations/storyMutations.js';

it('expands nested forks through their exact anchor, including local ID reuse', () => {
  const model = createProcurementModel(),
    parent = createPaymentStory();
  createStory(model, parent);
  forkStory(model, {
    id: 'child',
    title: '分期',
    forkedFrom: { storyId: parent.id, stepId: 'request' },
    steps: [{ ...parent.steps[2], basedOn: ['payment#request'] }],
  });
  forkStory(model, {
    id: 'grandchild',
    title: '复核',
    forkedFrom: { storyId: 'child', stepId: 'confirm' },
    steps: [{ ...parent.steps[2], basedOn: ['child#confirm'] }],
  });
  const steps = resolveStorySteps(model, 'grandchild');
  expect(steps.map((s) => [s.ref, s.sequence, s.inherited])).toEqual([
    ['payment#sign', 1, true],
    ['payment#request', 2, true],
    ['child#confirm', 3, true],
    ['grandchild#confirm', 4, false],
  ]);
  const trace = resolveStoryTraces(model, {
    gaps: ['request.payment: missing confirmation'],
  }).find((s) => s.flowId === 'grandchild')!;
  expect(trace.steps[1].gaps).toEqual([
    'request.payment: missing confirmation',
  ]);
  expect(trace.steps[1]).toMatchObject({
    actorRef: 'role.seller',
    activity: '发起',
    targetActorRef: 'role.buyer',
  });
  const step = trace.steps[1];
  expect(computeStepHash({ ...step, activity: '撤回' })).not.toBe(
    step.stepHash,
  );
  expect(
    computeStepHash({
      ...step,
      values: Object.fromEntries(Object.entries(step.values).reverse()),
    }),
  ).toBe(step.stepHash);
  expect(parent.steps[1].basedOn).toEqual(['sign']);
});
