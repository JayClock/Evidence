import { storyFlow } from '@evidence-poc/desktop-testing/story';
import { storyForks } from './storyForks';
it('attaches only direct children to the exact local step', () => {
  const parent = storyFlow();
  const child = (id: string, storyId: string, stepId: string) => ({
    ...storyFlow(id),
    forkedFrom: { storyId, stepId },
  });
  const a = child('refund', parent.flowId, 'step-2'),
    b = child('review', parent.flowId, 'step-2'),
    nested = child('reject', a.flowId, 'step-1');
  const branches = storyForks([parent, a, b, nested], parent);
  expect([...branches.keys()]).toEqual([2]);
  expect(branches.get(2)?.map((s) => s.flow.flowId)).toEqual([
    'refund',
    'review',
  ]);
  expect(storyForks([parent, a, b, nested], a).get(1)?.[0].flow.flowId).toBe(
    'reject',
  );
});
