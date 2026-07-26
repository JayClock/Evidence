import {
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  IntakeApiClient,
  type RemoteUnderstanding,
  type UnderstandingScenarioInput,
} from './intake-api-client';

export interface UnderstandingAnalystToolState {
  attempted: boolean;
  completed: boolean;
}

export function createUnderstandingAnalystTools(
  client: IntakeApiClient,
  understanding: RemoteUnderstanding,
  state: UnderstandingAnalystToolState,
): ToolDefinition[] {
  const once = () => {
    if (state.attempted) {
      throw new Error('Understand/TQA permits exactly one workflow tool call.');
    }
    state.attempted = true;
  };
  return [
    defineTool({
      name: 'evidence_ask_tqa_question',
      label: 'Ask one TQA question',
      description:
        'Persist exactly one high-value business-facing question for the active Story, then stop.',
      parameters: Type.Object({
        target: Type.Union([
          Type.Literal('business_context'),
          Type.Literal('story'),
          Type.Literal('history'),
        ]),
        question: Type.String({ minLength: 1, maxLength: 1_536 }),
      }),
      async execute(_toolCallId, params, signal) {
        once();
        const result = await client.askUnderstandingQuestion(
          understanding,
          params,
          signal,
        );
        state.completed = true;
        return resultContent(result);
      },
    }),
    defineTool({
      name: 'evidence_propose_story_scenarios',
      label: 'Propose Story Scenarios',
      description:
        'Persist the complete concrete 1–5 Scenario acceptance set for human review, then stop.',
      parameters: Type.Object({
        scenarios: Type.Array(
          Type.Object({
            title: Type.String({ minLength: 1, maxLength: 200 }),
            given: Type.Array(Type.String({ minLength: 1 }), {
              minItems: 1,
              maxItems: 20,
            }),
            when: Type.String({ minLength: 1, maxLength: 2_000 }),
            then: Type.Array(Type.String({ minLength: 1 }), {
              minItems: 1,
              maxItems: 20,
            }),
            businessData: Type.Array(Type.String({ minLength: 1 }), {
              minItems: 1,
              maxItems: 20,
            }),
          }),
          { minItems: 1, maxItems: 5 },
        ),
      }),
      async execute(_toolCallId, params, signal) {
        once();
        const result = await client.proposeUnderstandingScenarios(
          understanding,
          params.scenarios as UnderstandingScenarioInput[],
          signal,
        );
        state.completed = true;
        return resultContent(result);
      },
    }),
  ];
}

function resultContent(result: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    details: result,
  };
}
