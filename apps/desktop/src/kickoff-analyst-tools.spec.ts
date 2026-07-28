import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import type {
  FlowApiClient,
  RemoteKickoff,
} from './adapters/server-api/flow-client';
import { createKickoffAnalystTools } from './kickoff-analyst-tools';

const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const proposal = {
  title: 'Narrower Story',
  problem: 'The original goal was too broad.',
  role: 'Workspace maintainer',
  goal: 'Start one reviewable Story.',
  value: 'Kickoff remains bounded.',
  cognitiveMode: 'clear' as const,
  citations: [
    { inboxItemId: 'inbox-1', revisionSha256, locator: 'paragraph 2' },
  ],
};
const kickoff = {
  iteration: {
    id: 'iteration-1',
    reference: 'ITER-0001',
    lifecycle: 'active',
    loop: 'kickoff',
    stage: 'candidate_drafting',
    version: 3,
    baseCommitSha: 'b'.repeat(40),
    branchName: 'evidence/iter-iteration-1',
    links: {},
    raw: {},
  },
  intake: {
    sources: [{ inboxItemId: 'inbox-1', contentSha256: revisionSha256 }],
  },
  currentProposal: null,
  decisions: [{ action: 'revise', reason: 'Narrow the goal.' }],
  links: {
    'propose-replacement':
      '/api/workspaces/workspace-1/iterations/iteration-1/kickoff/proposals',
  },
  raw: {},
} satisfies RemoteKickoff;

describe('Kickoff Analyst tools', () => {
  it('exposes one replacement-only capability without human decisions', async () => {
    const proposeKickoffReplacement = vi.fn(async () => ({
      id: 'proposal-2',
      reference: 'KICKOFF-0002',
      contentSha256: `sha256:${'c'.repeat(64)}`,
    }));
    const client = { proposeKickoffReplacement } as unknown as FlowApiClient;
    const state = { attempted: false, completed: false };
    const tools = createKickoffAnalystTools(client, kickoff, state);

    expect(tools.map((tool) => tool.name)).toEqual([
      'evidence_propose_kickoff_candidate',
    ]);
    expect(tools.map((tool) => tool.name)).not.toContain('confirm');
    expect(tools.map((tool) => tool.name)).not.toContain('bash');

    const result = await execute(tools[0] as ToolDefinition, proposal);

    expect(proposeKickoffReplacement).toHaveBeenCalledWith(
      kickoff,
      proposal,
      expect.any(AbortSignal),
    );
    expect(state).toEqual({ attempted: true, completed: true });
    expect(JSON.stringify(result)).toContain('KICKOFF-0002');
    await expect(execute(tools[0] as ToolDefinition, proposal)).rejects.toThrow(
      'one-shot',
    );
  });
});

function execute(
  tool: ToolDefinition,
  params: Record<string, unknown>,
): Promise<unknown> {
  return tool.execute(
    'tool-call-1',
    params,
    new AbortController().signal,
    undefined,
    undefined as never,
  );
}
