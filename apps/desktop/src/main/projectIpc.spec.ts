import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EVIDENCE_IPC_CHANNELS as channels } from '@evidence-poc/desktop-contracts/ipc';
import type { OpenProjectResult } from '@evidence-poc/desktop-contracts/projects';
import { STORY_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/story';
import { registerProjectIpc } from './projectIpc';
import { createProjectStore } from './projectStore';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  changes: [] as (() => void)[],
  close: vi.fn(async () => undefined),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler),
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: {},
}));
vi.mock('./modelWatcher', () => ({
  watchModelSource: (_root: string, change: () => void) => {
    mocks.changes.push(change);
    return { close: mocks.close, ready: Promise.resolve() };
  },
}));

const invoke = async <T = unknown>(
  channel: string,
  sender: object,
  ...args: unknown[]
) => (await mocks.handlers.get(channel)!({ sender }, ...args)) as T;

const editor = (id: number) =>
  Object.assign(new EventEmitter(), {
    id,
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
  });

describe('project persistence IPC', () => {
  it('persists an unfinished CEL expression, ignores its own watcher event, and never overwrites an external edit', async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), 'live-project-')),
    );
    const sender = editor(1);
    const other = editor(2);
    try {
      const projectStore = createProjectStore({
        recentProjectsFile: path.join(root, 'recents.json'),
      });
      const created = await projectStore.create({
        targetPath: root,
        name: 'Editable project',
        templateId: 'procurement',
      });
      if (!created.success) throw new Error(created.error);
      const onPersisted = vi.fn();
      const persistence = registerProjectIpc({
        projectStore,
        openEditorWindow: vi.fn(),
        ownsProject: (contents, project) =>
          contents.id === sender.id && project === root,
        onPersisted,
      });
      const opened = await invoke<OpenProjectResult>(
        channels.open,
        sender,
        root,
      );
      if (!opened.success) throw new Error(opened.error);
      const { persistenceId, document } = opened;
      const draft = structuredClone(document);
      draft.rules[0]!.expression = 'true && (';
      const input = { persistenceId, revision: 1, document: draft };
      expect(
        await invoke(channels.enqueuePersistence, other, input),
      ).toMatchObject({ success: false });
      expect(await invoke(channels.enqueuePersistence, sender, input)).toEqual({
        success: true,
      });
      expect(persistence.hasPending()).toBe(true);
      expect(await persistence.drain()).toBe(true); // also the normal quit path
      const persisted = await projectStore.open(root);
      expect(persisted).toMatchObject({
        success: true,
        document: {
          rules: expect.arrayContaining([
            expect.objectContaining({ expression: 'true && (' }),
          ]),
        },
      });
      expect(
        onPersisted.mock.calls.map(([snapshot]) => snapshot.revision),
      ).toEqual([0, 1]);
      sender.send.mockClear();
      mocks.changes.at(-1)!();
      // Wait for both reads on the watcher side to settle before changing disk again.
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(sender.send).not.toHaveBeenCalledWith(
        STORY_IPC_CHANNELS.INVALIDATED,
        expect.anything(),
      );
      const file = path.join(opened.project.modelDirectory, 'model.json');
      const external = (await readFile(file, 'utf8')).replace(
        'Editable project',
        'external title',
      );
      await writeFile(file, external);
      expect(
        await invoke(channels.enqueuePersistence, sender, {
          ...input,
          revision: 2,
        }),
      ).toEqual({ success: true });
      expect(
        await invoke(channels.flushPersistence, sender, persistenceId),
      ).toMatchObject({ success: false });
      expect(await readFile(file, 'utf8')).toBe(external);
      mocks.changes.at(-1)!();
      await vi.waitFor(() =>
        expect(sender.send).toHaveBeenCalledWith(
          STORY_IPC_CHANNELS.INVALIDATED,
          { rootPath: root },
        ),
      );
      expect(other.send).not.toHaveBeenCalled();
      const reloaded = await invoke<OpenProjectResult>(
        channels.open,
        sender,
        root,
        'discard-pending',
      );
      expect(reloaded).toMatchObject({
        success: true,
        document: { manifest: { name: 'external title' } },
      });
      expect(
        await invoke(channels.enqueuePersistence, sender, {
          ...input,
          revision: 3,
        }),
      ).toMatchObject({ success: false });
      expect(persistence.hasPending()).toBe(false);
    } finally {
      sender.emit('destroyed');
      await rm(root, { recursive: true, force: true });
    }
    expect(mocks.close).toHaveBeenCalled();
  });
});
