import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureInboxSource,
  readInboxState,
} from '../../capabilities/inbox/repository';
import {
  inboxCandidateStatus,
  listInboxStoryCandidates,
  proposeInboxStoryCandidates,
} from '../../capabilities/inbox/story-candidate';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import { registerInboxCommands } from './inbox-commands';

function registeredCommand(
  runAgent?: Parameters<typeof registerInboxCommands>[1],
) {
  let handler:
    | ((args: string, ctx: ReturnType<typeof context>) => Promise<void>)
    | undefined;
  registerInboxCommands(
    {
      registerCommand(
        name: string,
        options: { handler: typeof handler },
      ): void {
        expect(name).toBe('evidence-inbox');
        handler = options.handler;
      },
    } as never,
    runAgent,
  );
  if (!handler) throw new Error('Inbox command was not registered.');
  return handler;
}

function context(cwd: string) {
  return {
    cwd,
    mode: 'rpc',
    hasUI: true,
    waitForIdle: vi.fn(),
    ui: {
      notify: vi.fn(),
      select: vi.fn(),
      input: vi.fn(),
      editor: vi.fn(),
      setStatus: vi.fn(),
    },
  };
}

afterEach(cleanupWorkspaces);

describe('/evidence-inbox', () => {
  it('captures manually entered source text', async () => {
    const cwd = workspace();
    const ctx = context(cwd);
    ctx.ui.editor.mockResolvedValue('The owner needs an audit trail.');

    await registeredCommand()('add text Domain interview', ctx);

    expect(readInboxState(cwd).items).toEqual([
      expect.objectContaining({
        inbox_id: 'INBOX-0001',
        source_kind: 'manual_text',
        title: 'Domain interview',
      }),
    ]);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'INBOX-0001 captured from manual text.',
      'info',
    );
  });

  it('captures a local Markdown source through the same Inbox', async () => {
    const cwd = workspace();
    write(cwd, 'notes/interview.md', '# Interview\n\nA confirmed note.\n');
    const ctx = context(cwd);

    await registeredCommand()('add file notes/interview.md', ctx);

    expect(readInboxState(cwd).items[0]).toMatchObject({
      source_kind: 'local_markdown',
      external_key: 'workspace:notes/interview.md',
    });
  });

  it('synchronizes a refreshable source as a new revision', async () => {
    const cwd = workspace();
    write(cwd, 'notes/interview.md', '# Interview\n\nFirst note.\n');
    const ctx = context(cwd);
    const command = registeredCommand();
    await command('add file notes/interview.md', ctx);
    write(cwd, 'notes/interview.md', '# Interview\n\nChanged note.\n');

    await command('sync INBOX-0001', ctx);

    expect(readInboxState(cwd).items[0].revision_paths).toHaveLength(2);
    expect(ctx.ui.notify).toHaveBeenLastCalledWith(
      'INBOX-0001 appended a new source revision.',
      'info',
    );
  });

  it('does not synchronize immutable manual text', async () => {
    const cwd = workspace();
    const ctx = context(cwd);
    ctx.ui.editor.mockResolvedValue('One immutable interview note.');
    const command = registeredCommand();
    await command('add text Interview', ctx);

    await command('sync INBOX-0001', ctx);

    expect(ctx.ui.notify).toHaveBeenLastCalledWith(
      expect.stringContaining('cannot be synchronized'),
      'error',
    );
  });

  it('extracts cited Story candidates with an isolated Inbox analyst', async () => {
    const cwd = workspace();
    const captured = captureInboxSource(cwd, {
      source_kind: 'manual_text',
      external_key: 'manual:interview',
      title: 'Domain interview',
      body: 'The owner needs an audit trail.',
    });
    const runAgent = vi.fn(async (options: { task: string }) => {
      expect(options.task).toContain(captured.revision.artifact_path);
      expect(options.task).toContain(captured.revision.content_sha256);
      proposeInboxStoryCandidates(
        cwd,
        ['INBOX-0001'],
        [
          {
            title: 'Retain deletion evidence',
            problem: 'Deletion is not auditable.',
            role: 'workspace owner',
            goal: 'retain deletion evidence',
            value: 'support an audit',
            cognitiveMode: 'complex',
            citations: [
              {
                inboxId: 'INBOX-0001',
                revisionSha256: captured.revision.content_sha256,
                locator: 'whole source',
              },
            ],
          },
        ],
      );
      return {
        agent: 'inbox-analyst',
        model: 'test/model',
        thinking: 'high' as const,
        output: 'Recorded CAND-0001.',
        messages: [],
        exitCode: 0,
        stderr: '',
      };
    });
    const ctx = context(cwd);

    await registeredCommand(runAgent as never)('extract INBOX-0001', ctx);

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'inbox-analyst', cwd }),
    );
    expect(listInboxStoryCandidates(cwd)).toHaveLength(1);
    expect(ctx.waitForIdle).toHaveBeenCalledOnce();
  });

  it('records a human candidate disposition', async () => {
    const cwd = workspace();
    const captured = captureInboxSource(cwd, {
      source_kind: 'manual_text',
      external_key: 'manual:interview',
      title: 'Interview',
      body: 'The owner needs an audit trail.',
    });
    const [candidate] = proposeInboxStoryCandidates(
      cwd,
      ['INBOX-0001'],
      [
        {
          title: 'Retain deletion evidence',
          problem: 'Deletion is not auditable.',
          role: 'workspace owner',
          goal: 'retain deletion evidence',
          value: 'support an audit',
          cognitiveMode: 'complex',
          citations: [
            {
              inboxId: 'INBOX-0001',
              revisionSha256: captured.revision.content_sha256,
              locator: 'whole source',
            },
          ],
        },
      ],
    );
    const ctx = context(cwd);

    await registeredCommand()(
      'reject CAND-0001 This is outside the product boundary.',
      ctx,
    );

    expect(inboxCandidateStatus(cwd, candidate)).toBe('rejected');
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'CAND-0001 rejected: This is outside the product boundary.',
      'info',
    );
  });

  it('asks the human to choose a source when the Inbox is empty', async () => {
    const cwd = workspace();
    const ctx = context(cwd);
    ctx.ui.select.mockResolvedValue('手工文本');
    ctx.ui.input.mockResolvedValue('Domain interview');
    ctx.ui.editor.mockResolvedValue('The owner needs an audit trail.');

    await registeredCommand()('', ctx);

    expect(ctx.ui.select).toHaveBeenCalledWith('Add an Inbox source', [
      'GitHub Issue',
      '手工文本',
      '本地 Markdown',
    ]);
    expect(readInboxState(cwd).items[0]).toMatchObject({
      source_kind: 'manual_text',
      title: 'Domain interview',
    });
  });

  it('still lists an empty Inbox when list is explicit', async () => {
    const cwd = workspace();
    const ctx = context(cwd);

    await registeredCommand()('list', ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Items: 0'),
      'info',
    );
    expect(ctx.ui.select).not.toHaveBeenCalled();
  });
});
