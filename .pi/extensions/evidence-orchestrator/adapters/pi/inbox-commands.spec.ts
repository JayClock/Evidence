import { afterEach, describe, expect, it, vi } from 'vitest';
import { readInboxState } from '../../capabilities/inbox/repository';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import { registerInboxCommands } from './inbox-commands';

function registeredCommand() {
  let handler:
    | ((args: string, ctx: ReturnType<typeof context>) => Promise<void>)
    | undefined;
  registerInboxCommands({
    registerCommand(name: string, options: { handler: typeof handler }): void {
      expect(name).toBe('evidence-inbox');
      handler = options.handler;
    },
  } as never);
  if (!handler) throw new Error('Inbox command was not registered.');
  return handler;
}

function context(cwd: string) {
  return {
    cwd,
    mode: 'rpc',
    hasUI: true,
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

  it('lists an empty Inbox without requiring an active iteration', async () => {
    const cwd = workspace();
    const ctx = context(cwd);

    await registeredCommand()('', ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Items: 0'),
      'info',
    );
  });
});
