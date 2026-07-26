import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import type {
  IntakeApiClient,
  RemoteTasking,
  TaskingDraftInput,
  TaskingProjectCatalogInput,
} from './intake-api-client';
import { createTaskingAnalystTools } from './tasking-analyst-tools';

const projectCatalog: TaskingProjectCatalogInput = {
  projects: [
    {
      id: '@evidence/desktop',
      root: 'apps/desktop',
      targets: ['test', 'typecheck'],
    },
  ],
};

const tasking = {
  iteration: {
    id: 'iteration-1',
    reference: 'ITER-0001',
    lifecycle: 'active',
    loop: 'tasking',
    stage: 'drafting',
    version: 4,
    baseCommitSha: 'a'.repeat(40),
    branchName: 'evidence/iter-iteration-1',
    links: {},
    raw: {},
  },
  story: { id: 'story-1' },
  storyRevision: { id: 'revision-2' },
  noModelImpactDecision: {
    id: 'no-model-1',
    contentSha256: `sha256:${'b'.repeat(64)}`,
  },
  currentCandidate: null,
  decisions: [],
  approvedPlan: null,
  processCatalog: [],
  links: {
    'propose-candidate':
      '/api/workspaces/workspace-1/iterations/iteration-1/tasking/candidates',
  },
  raw: {},
} satisfies RemoteTasking;

const draft: TaskingDraftInput = {
  runtimes: [
    {
      id: 'RUNTIME-001',
      runtime: 'typescript',
      functionalContexts: ['delivery'],
      technicalBoundaries: ['electron-main'],
      projectIds: ['@evidence/desktop'],
    },
  ],
  tests: [
    {
      id: 'TEST-001',
      quadrant: 'Q1',
      intent: 'Drive the Desktop boundary.',
      runtimePlanId: 'RUNTIME-001',
      stepId: 'electron-shell-q1',
      testFilter: 'tasking-shell',
      supportedBy: [],
      scenarioIds: ['SC-001'],
      businessData: [],
      modelRefs: { entities: [], associations: [] },
    },
    {
      id: 'TEST-002',
      quadrant: 'Q2',
      intent: 'Confirm the Scenario.',
      runtimePlanId: 'RUNTIME-001',
      stepId: 'electron-package-q2',
      testFilter: 'tasking-package',
      supportedBy: ['TEST-001'],
      scenarioIds: ['SC-001'],
      scenarioOutcome: 'A Candidate awaits Desk Check',
      businessData: [],
      modelRefs: { entities: [], associations: [] },
    },
  ],
  tasks: [
    {
      id: 'TASK-001',
      description: 'Drive the Tasking boundary.',
      testIds: ['TEST-001', 'TEST-002'],
      dependsOn: [],
    },
  ],
};

describe('Tasking Analyst tools', () => {
  it('exposes one proposal-only capability without Desk Check authority', async () => {
    const proposeTasking = vi.fn(async () => ({
      id: 'tasking-1',
      reference: 'TASKING-001',
    }));
    const client = { proposeTasking } as unknown as IntakeApiClient;
    const state = { attempted: false, completed: false };
    const tools = createTaskingAnalystTools(
      client,
      tasking,
      projectCatalog,
      state,
    );

    expect(tools.map(({ name }) => name)).toEqual([
      'evidence_propose_tasking_candidate',
    ]);
    expect(tools.map(({ name }) => name).join(' ')).not.toMatch(
      /approve|decide|bash/,
    );

    await execute(tools[0] as ToolDefinition, draft);

    expect(proposeTasking).toHaveBeenCalledWith(
      tasking,
      projectCatalog,
      draft,
      expect.any(AbortSignal),
    );
    expect(state).toEqual({ attempted: true, completed: true });
    await expect(execute(tools[0] as ToolDefinition, draft)).rejects.toThrow(
      'one-shot',
    );
  });
});

function execute(
  tool: ToolDefinition,
  params: TaskingDraftInput,
): Promise<unknown> {
  return tool.execute(
    'tool-call-1',
    params as unknown as Record<string, unknown>,
    new AbortController().signal,
    undefined,
    undefined as never,
  );
}
