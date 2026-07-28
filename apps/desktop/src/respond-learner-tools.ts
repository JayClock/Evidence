import {
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { RespondLearnerDetails } from './respond-learner-protocol';
import { createReadOnlyRepositoryTools } from './showcase-reviewer-tools';

export interface RespondLearnerToolState {
  response: Omit<RespondLearnerDetails, 'agentCallCount'> | null;
}

export async function createRespondLearnerTools(
  worktreeRoot: string,
  state: RespondLearnerToolState,
): Promise<ToolDefinition[]> {
  return [
    ...(await createReadOnlyRepositoryTools(worktreeRoot)),
    submitResponseTool(state),
  ];
}

function submitResponseTool(state: RespondLearnerToolState): ToolDefinition {
  const promotion = Type.Object({
    sourceRef: Type.String({ minLength: 1, maxLength: 500 }),
    kind: Type.Union([
      Type.Literal('product'),
      Type.Literal('model'),
      Type.Literal('architecture'),
      Type.Literal('contract'),
      Type.Literal('test_process'),
      Type.Literal('skill'),
      Type.Literal('prompt'),
      Type.Literal('other'),
    ]),
    decision: Type.Union([
      Type.Literal('promoted'),
      Type.Literal('deferred'),
      Type.Literal('rejected'),
    ]),
    reason: Type.String({ minLength: 1, maxLength: 4_000 }),
    validationEvidenceRefs: Type.Array(
      Type.String({ minLength: 1, maxLength: 500 }),
      { minItems: 1, maxItems: 50 },
    ),
    canonicalTarget: Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ]),
  });
  return defineTool({
    name: 'evidence_submit_respond_candidate',
    label: 'Submit Respond Candidate',
    description:
      'Submit exactly one bounded knowledge response Candidate and next Probe. This grants no human approval authority.',
    parameters: Type.Object({
      promotions: Type.Array(promotion, { maxItems: 50 }),
      noPromotionReason: Type.Union([
        Type.String({ minLength: 1, maxLength: 4_000 }),
        Type.Null(),
      ]),
      observedOutcomes: Type.Array(
        Type.String({ minLength: 1, maxLength: 500 }),
        { minItems: 1, maxItems: 50 },
      ),
      residualRisks: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), {
        maxItems: 50,
      }),
      nextProbe: Type.Object({
        question: Type.String({ minLength: 1, maxLength: 4_000 }),
        whyNow: Type.String({ minLength: 1, maxLength: 4_000 }),
        evidenceRefs: Type.Array(
          Type.String({ minLength: 1, maxLength: 500 }),
          { minItems: 1, maxItems: 50 },
        ),
        firstAction: Type.String({ minLength: 1, maxLength: 4_000 }),
      }),
    }),
    async execute(_toolCallId, params) {
      if (state.response) {
        throw new Error('Respond Candidate submission is one-shot.');
      }
      if (
        (params.promotions.length === 0 && !params.noPromotionReason) ||
        (params.promotions.length > 0 && params.noPromotionReason)
      ) {
        throw new Error(
          'Exactly one of promotions or noPromotionReason must carry the knowledge response.',
        );
      }
      if (
        params.promotions.some(
          (item) => item.decision === 'promoted' && !item.canonicalTarget,
        )
      ) {
        throw new Error('Promoted knowledge requires a canonical target.');
      }
      state.response = {
        promotions: params.promotions.map((item) => ({
          sourceRef: item.sourceRef.trim(),
          kind: item.kind,
          decision: item.decision,
          reason: item.reason.trim(),
          validationEvidenceRefs: item.validationEvidenceRefs.map((value) =>
            value.trim(),
          ),
          canonicalTarget: item.canonicalTarget?.trim() ?? null,
        })),
        noPromotionReason: params.noPromotionReason?.trim() ?? null,
        observedOutcomes: params.observedOutcomes.map((value) => value.trim()),
        residualRisks: params.residualRisks.map((value) => value.trim()),
        nextProbe: {
          question: params.nextProbe.question.trim(),
          whyNow: params.nextProbe.whyNow.trim(),
          evidenceRefs: params.nextProbe.evidenceRefs.map((value) =>
            value.trim(),
          ),
          firstAction: params.nextProbe.firstAction.trim(),
        },
      };
      return {
        content: [
          {
            type: 'text' as const,
            text: 'The Respond Candidate was returned to the local Controller. Human knowledge authority remains unchanged.',
          },
        ],
        details: state.response,
      };
    },
  });
}
