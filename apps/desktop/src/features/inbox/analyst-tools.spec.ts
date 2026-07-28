import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import { createInboxAnalystTools } from './analyst-tools';
import type {
  FlowApiClient,
  RemoteInboxExtraction,
} from '../../adapters/server-api/flow-client';

const revisionSha256 = `sha256:${'a'.repeat(64)}`;
const extraction: RemoteInboxExtraction = {
  id: 'extraction-1',
  reference: 'EXTRACT-0001',
  status: 'awaiting_agent',
  version: 1,
  sources: [
    {
      inboxItemId: 'inbox-1',
      inboxRevisionId: 'revision-1',
      contentSha256: revisionSha256,
    },
  ],
  links: {
    'propose-candidates':
      '/api/workspaces/workspace-1/inbox-extractions/extraction-1/candidates',
  },
  raw: {},
};
const candidate = {
  title: 'One Story',
  problem: 'The source is not yet a delivery boundary.',
  role: 'Workspace maintainer',
  goal: 'Start one frozen iteration.',
  value: 'The decision remains traceable.',
  cognitiveMode: 'complicated' as const,
  citations: [
    { inboxItemId: 'inbox-1', revisionSha256, locator: 'whole-source' },
  ],
};

describe('Inbox Analyst tools', () => {
  it('exposes exactly one one-shot proposal capability', async () => {
    const proposeInboxCandidates = vi.fn(async () => ({
      extraction: { ...extraction, status: 'completed' as const, version: 2 },
      candidates: [
        {
          id: 'candidate-1',
          reference: 'CAND-0001',
          status: 'ready' as const,
          contentSha256: `sha256:${'b'.repeat(64)}`,
          links: {},
          raw: {},
        },
      ],
    }));
    const client = { proposeInboxCandidates } as unknown as FlowApiClient;
    const state = { attempted: false, completed: false };
    const tools = createInboxAnalystTools(client, extraction, state);

    expect(tools.map((tool) => tool.name)).toEqual([
      'evidence_propose_inbox_stories',
    ]);
    expect(tools.map((tool) => tool.name)).not.toContain('bash');
    expect(tools.map((tool) => tool.name)).not.toContain('write');

    const result = await execute(tools[0] as ToolDefinition, {
      candidates: [candidate],
    });

    expect(proposeInboxCandidates).toHaveBeenCalledWith(
      extraction,
      [candidate],
      expect.any(AbortSignal),
    );
    expect(state).toEqual({ attempted: true, completed: true });
    expect(JSON.stringify(result)).toContain('candidate-1');
    await expect(
      execute(tools[0] as ToolDefinition, { candidates: [candidate] }),
    ).rejects.toThrow('one-shot');
  });

  it('does not allow a retry after an ambiguous failed submission', async () => {
    const client = {
      proposeInboxCandidates: vi.fn(async () => {
        throw new Error('connection closed after write');
      }),
    } as unknown as FlowApiClient;
    const state = { attempted: false, completed: false };
    const tool = createInboxAnalystTools(client, extraction, state)[0];
    if (!tool) throw new Error('Inbox Analyst tool missing');

    await expect(execute(tool, { candidates: [candidate] })).rejects.toThrow(
      'connection closed',
    );
    expect(state).toEqual({ attempted: true, completed: false });
    await expect(execute(tool, { candidates: [candidate] })).rejects.toThrow(
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
