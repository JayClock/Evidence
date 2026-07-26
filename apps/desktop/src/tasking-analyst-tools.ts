import {
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  IntakeApiClient,
  type RemoteTasking,
  type TaskingDraftInput,
  type TaskingProjectCatalogInput,
} from './intake-api-client';

export interface TaskingAnalystToolState {
  attempted: boolean;
  completed: boolean;
}

const functionalContext = Type.Union([
  Type.Literal('workspace'),
  Type.Literal('work-intake'),
  Type.Literal('delivery'),
  Type.Literal('logical-model'),
  Type.Literal('diagram-projection'),
  Type.Literal('model-proposal'),
]);

const technicalBoundary = Type.Union([
  Type.Literal('react-route'),
  Type.Literal('react-feature'),
  Type.Literal('rest-client'),
  Type.Literal('http-server'),
  Type.Literal('nest-api'),
  Type.Literal('nest-domain'),
  Type.Literal('prisma-store'),
  Type.Literal('electron-main'),
  Type.Literal('electron-preload'),
  Type.Literal('desktop-binding-store'),
  Type.Literal('git-worktree'),
  Type.Literal('webview'),
]);

export function createTaskingAnalystTools(
  client: IntakeApiClient,
  tasking: RemoteTasking,
  projectCatalog: TaskingProjectCatalogInput,
  state: TaskingAnalystToolState,
): ToolDefinition[] {
  return [
    defineTool({
      name: 'evidence_propose_tasking_candidate',
      label: 'Propose complete Tasking Candidate',
      description:
        'Persist one complete Q1/Q2, v3 process, Nx ownership, and dependency-ordered TASK proposal for human Desk Check, then stop.',
      parameters: Type.Object({
        runtimes: Type.Array(
          Type.Object({
            id: Type.String({ pattern: '^RUNTIME-[0-9]{3,}$' }),
            runtime: Type.Literal('typescript'),
            functionalContexts: Type.Array(functionalContext, {
              minItems: 1,
              maxItems: 6,
            }),
            technicalBoundaries: Type.Array(technicalBoundary, {
              minItems: 1,
              maxItems: 12,
            }),
            projectIds: Type.Array(Type.String({ minLength: 1 }), {
              minItems: 1,
              maxItems: 25,
            }),
          }),
          { minItems: 1, maxItems: 3 },
        ),
        tests: Type.Array(
          Type.Object({
            id: Type.String({ pattern: '^TEST-[0-9]{3,}$' }),
            quadrant: Type.Union([Type.Literal('Q1'), Type.Literal('Q2')]),
            intent: Type.String({ minLength: 1, maxLength: 2_000 }),
            runtimePlanId: Type.String({ minLength: 1 }),
            stepId: Type.String({ minLength: 1 }),
            projectId: Type.Optional(Type.String({ minLength: 1 })),
            testFilter: Type.String({
              minLength: 1,
              maxLength: 200,
              pattern: '^[A-Za-z0-9_@./:-]+$',
            }),
            supportedBy: Type.Array(Type.String({ minLength: 1 }), {
              maxItems: 50,
            }),
            scenarioIds: Type.Array(Type.String({ minLength: 1 }), {
              minItems: 1,
              maxItems: 5,
            }),
            scenarioOutcome: Type.Optional(
              Type.String({ minLength: 1, maxLength: 2_000 }),
            ),
            businessData: Type.Array(Type.String({ minLength: 1 }), {
              maxItems: 50,
            }),
            modelRefs: Type.Object({
              entities: Type.Array(Type.String(), { maxItems: 0 }),
              associations: Type.Array(Type.String(), { maxItems: 0 }),
            }),
          }),
          { minItems: 2, maxItems: 100 },
        ),
        tasks: Type.Array(
          Type.Object({
            id: Type.String({ pattern: '^TASK-[0-9]{3,}$' }),
            description: Type.String({ minLength: 1, maxLength: 2_000 }),
            testIds: Type.Array(Type.String({ minLength: 1 }), {
              minItems: 1,
              maxItems: 100,
            }),
            dependsOn: Type.Array(Type.String({ minLength: 1 }), {
              maxItems: 99,
            }),
          }),
          { minItems: 1, maxItems: 100 },
        ),
      }),
      async execute(_toolCallId, params, signal) {
        if (state.attempted) {
          throw new Error('Tasking Analyst is one-shot per turn.');
        }
        state.attempted = true;
        const result = await client.proposeTasking(
          tasking,
          projectCatalog,
          params as TaskingDraftInput,
          signal,
        );
        state.completed = true;
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ],
          details: result,
        };
      },
    }),
  ];
}
