import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupWorkspaces, workspace } from '../../test-support/support';
import {
  captureInboxSource,
  latestInboxRevision,
  readInboxState,
  validateInboxRepository,
} from './repository';

afterEach(cleanupWorkspaces);

const githubIssue = {
  source_kind: 'github_issue',
  external_key: 'github:owner/evidence#42',
  uri: 'https://github.com/owner/evidence/issues/42',
  title: 'Safely delete a logical entity',
  body: 'As a modeler, I need safe deletion.',
  provider_metadata: {
    repository: 'owner/evidence',
    issue_number: 42,
    labels: ['feature'],
  },
  source_updated_at: '2026-07-12T00:00:00Z',
} as const;

describe('Inbox repository', () => {
  it('captures the first immutable revision of a provider-neutral source', () => {
    const cwd = workspace();

    const captured = captureInboxSource(
      cwd,
      githubIssue,
      '2026-07-16T00:00:00Z',
    );

    expect(captured).toMatchObject({
      created: true,
      revision_created: true,
      item: {
        inbox_id: 'INBOX-0001',
        source_kind: 'github_issue',
        external_key: 'github:owner/evidence#42',
        status: 'active',
      },
      revision: {
        content_type: 'text/markdown',
        captured_at: '2026-07-16T00:00:00Z',
      },
    });
    expect(captured.revision.content_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(existsSync(join(cwd, captured.revision.artifact_path))).toBe(true);
    expect(() => validateInboxRepository(cwd)).not.toThrow();
  });

  it('does not create another revision when semantic source content is unchanged', () => {
    const cwd = workspace();
    const first = captureInboxSource(cwd, githubIssue, '2026-07-16T00:00:00Z');
    const duplicate = captureInboxSource(
      cwd,
      githubIssue,
      '2026-07-17T00:00:00Z',
    );

    expect(duplicate).toMatchObject({
      created: false,
      revision_created: false,
    });
    expect(duplicate.revision.captured_at).toBe('2026-07-16T00:00:00Z');
    expect(duplicate.revision.content_sha256).toBe(
      first.revision.content_sha256,
    );
    expect(readInboxState(cwd).items[0].revision_paths).toHaveLength(1);
  });

  it('appends a revision when the provider content changes', () => {
    const cwd = workspace();
    const first = captureInboxSource(cwd, githubIssue);
    const changed = captureInboxSource(cwd, {
      ...githubIssue,
      body: 'The deletion must also preserve an audit record.',
      source_updated_at: '2026-07-17T00:00:00Z',
    });

    expect(changed.item.inbox_id).toBe(first.item.inbox_id);
    expect(changed.revision.content_sha256).not.toBe(
      first.revision.content_sha256,
    );
    expect(changed.item.revision_paths).toHaveLength(2);
    expect(latestInboxRevision(cwd, 'INBOX-0001').body).toContain(
      'audit record',
    );
  });

  it('keeps identical external keys separate across source kinds', () => {
    const cwd = workspace();
    captureInboxSource(cwd, githubIssue);
    const manual = captureInboxSource(cwd, {
      source_kind: 'manual_text',
      external_key: githubIssue.external_key,
      title: 'Interview note',
      body: 'A domain expert described deletion.',
      content_type: 'text/plain',
    });

    expect(manual.item.inbox_id).toBe('INBOX-0002');
    expect(readInboxState(cwd).items).toHaveLength(2);
  });

  it('detects manual mutation of an immutable source revision', () => {
    const cwd = workspace();
    const captured = captureInboxSource(cwd, githubIssue);
    const path = join(cwd, captured.revision.artifact_path);
    const revision = JSON.parse(readFileSync(path, 'utf8')) as {
      body: string;
    };
    writeFileSync(
      path,
      `${JSON.stringify({ ...revision, body: 'mutated' }, null, 2)}\n`,
    );

    expect(() => validateInboxRepository(cwd)).toThrow(
      'revision hash is inconsistent',
    );
  });
});
