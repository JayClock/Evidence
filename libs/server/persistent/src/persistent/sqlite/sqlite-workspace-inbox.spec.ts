import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InboxSourceInput, Workspace } from '@evidence/server-domain';
import { hashInboxSource } from '../inbox-content';
import { SqliteRegistry } from './sqlite-registry';
import { SqliteUsers } from './sqlite-users';
import { SqliteWorkspaceInbox } from './sqlite-workspace-inbox';

const source: InboxSourceInput = {
  sourceKind: 'manual_text',
  externalKey: 'capture-1',
  title: 'Desktop coding agent',
  body: 'Run Pi locally.',
  contentType: 'text/markdown',
  providerMetadata: { channel: 'product' },
};

let root: string;
let registry: SqliteRegistry;
let workspace: Workspace;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'evidence-inbox-'));
  registry = new SqliteRegistry(join(root, 'registry.sqlite'));
  await registry.open();
  const users = new SqliteUsers(registry);
  const found = await users.workspaces().findByIdentity('default-workspace');
  if (!found) {
    throw new Error('Default workspace was not seeded.');
  }
  workspace = found;
});

afterEach(async () => {
  registry.close();
  await rm(root, { recursive: true, force: true });
});

describe('SQLite workspace Inbox', () => {
  it('captures, lists, and reads an item through the Workspace association', async () => {
    const captured = await workspace.captureInboxSource(source);

    expect(captured.revisionCreated).toBe(true);
    expect(captured.item.description()).toMatchObject({
      sourceKind: 'manual_text',
      externalKey: 'capture-1',
      latestRevisionSha256: hashInboxSource(source).contentSha256,
      revisionCount: 1,
      version: 1,
    });
    await expect(
      workspace.inbox().findByIdentity(captured.item.identity()),
    ).resolves.toMatchObject(captured.item);
    await expect(
      workspace.listInboxItems({
        page: 1,
        pageSize: 20,
        status: 'active',
        query: 'coding',
      }),
    ).resolves.toMatchObject([[expect.anything()], 1]);
    await expect(
      workspace.listInboxItems({
        page: 1,
        pageSize: 20,
        query: 'missing',
      }),
    ).resolves.toEqual([[], 0]);
  });

  it('deduplicates the latest content and appends a changed revision', async () => {
    const captured = await workspace.captureInboxSource(source);
    const unchanged = await workspace.appendInboxRevision(
      captured.item.identity(),
      source,
      captured.revision.description().contentSha256,
    );

    expect(unchanged.revisionCreated).toBe(false);
    expect(unchanged.item.description().revisionCount).toBe(1);

    const changedSource = {
      ...source,
      body: 'Run Pi in an isolated worktree.',
    };
    const changed = await workspace.appendInboxRevision(
      captured.item.identity(),
      changedSource,
      captured.revision.description().contentSha256,
    );

    expect(changed.revisionCreated).toBe(true);
    expect(changed.item.description()).toMatchObject({
      revisionCount: 2,
      version: 2,
      latestRevisionSha256: hashInboxSource(changedSource).contentSha256,
    });
    const [revisions, total] = await workspace.listInboxRevisions(
      captured.item.identity(),
      1,
      20,
    );
    expect(total).toBe(2);
    expect(
      revisions.map((revision) => revision.description().revisionNumber),
    ).toEqual([2, 1]);
  });

  it('enforces optimistic status changes and workspace ownership', async () => {
    const captured = await workspace.captureInboxSource(source);
    const deferred = await workspace.changeInboxItemStatus(
      captured.item.identity(),
      'deferred',
      1,
    );

    expect(deferred.description()).toMatchObject({
      status: 'deferred',
      version: 2,
    });
    await expect(
      workspace.changeInboxItemStatus(captured.item.identity(), 'closed', 1),
    ).rejects.toMatchObject({ kind: 'conflict' });

    const otherWorkspaceInbox = new SqliteWorkspaceInbox(
      registry,
      'other-workspace',
    );
    await expect(
      otherWorkspaceInbox.findByIdentity(captured.item.identity()),
    ).resolves.toBeNull();
    await expect(
      otherWorkspaceInbox.findRevision(
        captured.item.identity(),
        captured.revision.identity(),
      ),
    ).resolves.toBeNull();
  });
});
