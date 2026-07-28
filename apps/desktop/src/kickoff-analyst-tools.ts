import {
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  type InboxCandidateProposalInput,
  FlowApiClient,
  type RemoteKickoff,
} from './adapters/server-api/flow-client';

const cognitiveMode = Type.Union([
  Type.Literal('clear'),
  Type.Literal('complicated'),
  Type.Literal('complex'),
]);

export interface KickoffAnalystToolState {
  attempted: boolean;
  completed: boolean;
}

export function createKickoffAnalystTools(
  client: FlowApiClient,
  kickoff: RemoteKickoff,
  state: KickoffAnalystToolState,
): ToolDefinition[] {
  return [
    defineTool({
      name: 'evidence_propose_kickoff_candidate',
      label: 'Propose Kickoff replacement',
      description:
        'Submit one replacement Kickoff Proposal from the Frozen Intake and human revise history. Call exactly once, then stop.',
      parameters: Type.Object({
        title: Type.String({ minLength: 1, maxLength: 200 }),
        problem: Type.String({ minLength: 1, maxLength: 2_000 }),
        role: Type.String({ minLength: 1, maxLength: 200 }),
        goal: Type.String({ minLength: 1, maxLength: 2_000 }),
        value: Type.String({ minLength: 1, maxLength: 2_000 }),
        cognitiveMode,
        citations: Type.Array(
          Type.Object({
            inboxItemId: Type.String({ minLength: 1, maxLength: 256 }),
            revisionSha256: Type.String({
              pattern: '^sha256:[a-f0-9]{64}$',
            }),
            locator: Type.String({ minLength: 1, maxLength: 500 }),
          }),
          { minItems: 1, maxItems: 20 },
        ),
      }),
      async execute(_toolCallId, params, signal) {
        if (state.attempted) {
          throw new Error(
            'Kickoff replacement submission is a one-shot operation.',
          );
        }
        state.attempted = true;
        const result = await client.proposeKickoffReplacement(
          kickoff,
          params as InboxCandidateProposalInput,
          signal,
        );
        state.completed = true;
        const summary = {
          proposalId: requiredString(result.id, 'Kickoff Proposal id'),
          reference: requiredString(
            result.reference,
            'Kickoff Proposal reference',
          ),
          contentSha256: requiredString(
            result.contentSha256,
            'Kickoff Proposal content SHA-256',
          ),
        };
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(summary, null, 2) },
          ],
          details: summary,
        };
      },
    }),
  ];
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}
