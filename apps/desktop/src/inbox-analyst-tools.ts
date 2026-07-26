import {
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  type InboxCandidateProposalInput,
  IntakeApiClient,
  type RemoteInboxExtraction,
} from './intake-api-client';

const cognitiveMode = Type.Union([
  Type.Literal('clear'),
  Type.Literal('complicated'),
  Type.Literal('complex'),
]);

export interface InboxAnalystToolState {
  attempted: boolean;
  completed: boolean;
}

export function createInboxAnalystTools(
  client: IntakeApiClient,
  extraction: RemoteInboxExtraction,
  state: InboxAnalystToolState,
): ToolDefinition[] {
  return [
    defineTool({
      name: 'evidence_propose_inbox_stories',
      label: 'Propose Inbox Stories',
      description:
        'Submit the complete one-to-five Candidate set for the exact human-selected Extraction. Call exactly once, then stop.',
      parameters: Type.Object({
        candidates: Type.Array(
          Type.Object({
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
          { minItems: 1, maxItems: 5 },
        ),
      }),
      async execute(_toolCallId, params, signal) {
        if (state.attempted) {
          throw new Error(
            'Inbox Analyst Candidate submission is a one-shot operation.',
          );
        }
        state.attempted = true;
        const result = await client.proposeInboxCandidates(
          extraction,
          params.candidates as InboxCandidateProposalInput[],
          signal,
        );
        state.completed = true;
        const summary = {
          extractionId: result.extraction.id,
          status: result.extraction.status,
          candidateIds: result.candidates.map((candidate) => candidate.id),
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
