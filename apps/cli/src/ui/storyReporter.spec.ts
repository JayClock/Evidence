import { expect, it } from 'vitest';
import type { BusinessStoryProjection } from '@evidence-poc/evidence-agent';
import { renderStoryMarkdown, renderStoryText } from './storyReporter.js';

const stories: BusinessStoryProjection[] = [
  {
    flowId: 'payment',
    storyTitle: '采购结算',
    storySummary: '从合同到结算',
    businessGoal: '核对支付',
    scenes: [
      {
        stepIndex: 2,
        stepHash: 'internal-hash',
        timing: {
          rawIso: '2026-04-01T10:00:00Z',
          displayDate: '2026年4月1日 10:00 UTC',
        },
        activity: {
          actor: { roleId: 'seller', businessName: '卖方' },
          recipient: { roleId: 'buyer', businessName: '买方' },
          actionVerb: 'submit',
          actionPhrase: '提交《付款申请》',
          workObject: {
            entityId: 'request.payment',
            entityLabel: '付款申请',
            entityKind: 'fulfillment_request',
          },
        },
        narrative: {
          headline: '卖方向买方提交《付款申请》',
          prose: '依据已签署的合同。\n\n提交给买方。',
          status: 'authored',
        },
        prerequisites: [
          {
            previousStepIndex: 1,
            fromActorLabel: '卖方',
            workObjectLabel: '合同',
            businessSummary: '卖方签署《采购合同》',
          },
        ],
        documentCard: {
          title: '付款申请',
          keyAttributes: [
            {
              name: 'amount',
              label: '金额',
              value: '¥500.00',
              sourceOrigin: '合同',
            },
          ],
          generalAttributes: [
            {
              name: 'memo',
              label: '备注',
              value: '<script>x</script> | [链接](https://example.com)',
            },
          ],
        },
        expectation: {
          assignedToRoleLabel: '买方',
          deadlineNotice: '于4月3日前',
          expectedWorkObject: '支付确认',
          isControlGap: true,
        },
        ruleEvaluations: [],
      },
    ],
  },
];

it('renders a causal storyboard with real paragraphs and safely escaped model values', () => {
  const result = renderStoryMarkdown(stories);
  expect(result).toContain('### 2. 卖方向买方提交《付款申请》');
  expect(result).toContain('承接第 1 步**：卖方签署《采购合同》');
  expect(result).toContain('依据已签署的合同。\n\n提交给买方。');
  expect(result).toContain('核心商业要素');
  expect(result).toContain('业务归档要素');
  expect(result).toContain('协同闭环待补');
  expect(result).toContain('于4月3日前');
  expect(result).toContain('&lt;script&gt;');
  expect(result).toContain('\\[链接\\]');
  expect(result).not.toMatch(/<script>|internal-hash|request\.payment|\| ---/u);
});

it('keeps the causal rails and commercial values in compact text, without adding color to plain output', () => {
  const plain = renderStoryText(stories, { compact: true, color: false });
  expect(plain).toContain('承接第 1 步：卖方签署《采购合同》');
  expect(plain).toContain('金额：¥500.00');
  expect(plain).toContain('业务归档要素');
  expect(plain).toContain('协同闭环待补');
  expect(plain).not.toContain('提交给买方。');
  expect(plain).not.toContain('\u001b');
  expect(renderStoryText(stories, { color: true })).toContain('\u001b');
  expect(renderStoryMarkdown([])).toContain('未检测到');
});
