import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import {
  localMarkdownInboxSource,
  manualTextInboxSource,
} from './inbox-sources';

afterEach(cleanupWorkspaces);

describe('local Inbox sources', () => {
  it('captures manual text with a deterministic source key', async () => {
    const input = {
      title: 'Domain expert interview',
      body: 'The owner needs an auditable deletion.',
    };

    const first = await manualTextInboxSource.capture(input, '/unused');
    const second = await manualTextInboxSource.capture(input, '/unused');

    expect(first).toMatchObject({
      source_kind: 'manual_text',
      title: input.title,
      content_type: 'text/plain',
    });
    expect(first.external_key).toMatch(/^manual:[a-f0-9]{64}$/);
    expect(second.external_key).toBe(first.external_key);
  });

  it('captures a project Markdown file without leaking its absolute path', async () => {
    const cwd = workspace();
    write(cwd, 'notes/interview.md', '# Workspace interview\n\nOwner notes.\n');

    const captured = await localMarkdownInboxSource.capture(
      { path: 'notes/interview.md' },
      cwd,
    );

    expect(captured).toMatchObject({
      source_kind: 'local_markdown',
      external_key: 'workspace:notes/interview.md',
      uri: 'workspace://notes/interview.md',
      title: 'Workspace interview',
      provider_metadata: { path: 'notes/interview.md' },
    });
    expect(JSON.stringify(captured)).not.toContain(cwd);
  });

  it('rejects non-Markdown files and paths outside the project', async () => {
    const cwd = workspace();
    write(cwd, 'notes/input.txt', 'not markdown');

    await expect(
      localMarkdownInboxSource.capture({ path: 'notes/input.txt' }, cwd),
    ).rejects.toThrow('must be Markdown');
    await expect(
      localMarkdownInboxSource.capture({ path: '../outside.md' }, cwd),
    ).rejects.toThrow();
  });
});
