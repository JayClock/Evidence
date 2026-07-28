import {
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { createReadOnlyWorktreeTools } from '../../capabilities/read-only-worktree/tools';
import type { ShowcaseReviewerEvent } from './reviewer-protocol';

export type ShowcaseReviewDetails = Extract<
  ShowcaseReviewerEvent,
  { event: 'complete' }
>['details'];

export interface ShowcaseReviewerToolState {
  review: Omit<ShowcaseReviewDetails, 'agentCallCount'> | null;
}

export async function createShowcaseReviewerTools(
  worktreeRoot: string,
  state: ShowcaseReviewerToolState,
): Promise<ToolDefinition[]> {
  return [
    ...(await createReadOnlyWorktreeTools(worktreeRoot)),
    submitReviewTool(state),
  ];
}

function submitReviewTool(state: ShowcaseReviewerToolState): ToolDefinition {
  return defineTool({
    name: 'evidence_submit_showcase_review',
    label: 'Submit independent Showcase Review',
    description:
      'Submit exactly one evidence-grounded Review recommendation. This grants no human value decision authority.',
    parameters: Type.Object({
      observedFacts: Type.Array(
        Type.String({ minLength: 1, maxLength: 4_000 }),
        { minItems: 1, maxItems: 100 },
      ),
      productDomainFeedback: Type.Array(
        Type.String({ minLength: 1, maxLength: 4_000 }),
        { maxItems: 100 },
      ),
      technicalQualityFeedback: Type.Array(
        Type.String({ minLength: 1, maxLength: 4_000 }),
        { maxItems: 100 },
      ),
      unresolvedAssumptions: Type.Array(
        Type.String({ minLength: 1, maxLength: 4_000 }),
        { maxItems: 100 },
      ),
      recommendation: Type.Union([
        Type.Literal('accept'),
        Type.Literal('revise'),
      ]),
    }),
    async execute(_toolCallId, params) {
      if (state.review) {
        throw new Error('Showcase Review submission is one-shot.');
      }
      state.review = {
        observedFacts: params.observedFacts.map((value) => value.trim()),
        productDomainFeedback: params.productDomainFeedback.map((value) =>
          value.trim(),
        ),
        technicalQualityFeedback: params.technicalQualityFeedback.map((value) =>
          value.trim(),
        ),
        unresolvedAssumptions: params.unresolvedAssumptions.map((value) =>
          value.trim(),
        ),
        recommendation: params.recommendation,
      };
      return {
        content: [
          {
            type: 'text' as const,
            text: 'The independent Review was returned to the local Controller. Human value authority remains unchanged.',
          },
        ],
        details: state.review,
      };
    },
  });
}
