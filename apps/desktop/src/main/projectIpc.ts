import { randomUUID } from 'node:crypto';
import {
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
  type WebContents,
} from 'electron';

import { STORY_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/story';
import { EVIDENCE_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/ipc';
import type { ArtifactStatus } from '@evidence-poc/desktop-contracts/delivery';
import type {
  CreateProjectDialogResult,
  CreateProjectInput,
  LivePersistenceInput,
  OpenProjectResult,
} from '@evidence-poc/desktop-contracts/projects';
import { DomainModelDocumentSyntaxSchema } from '@evidence-poc/evidence-schema';

import { watchModelSource, type ModelWatcher } from './modelWatcher';
import { createLivePersistence, type PersistedModel } from './livePersistence';
import { modelSourceOf } from '@evidence-poc/desktop-services';
import type { ProjectStore } from './projectStore';
import { listProjectTemplates } from './templates/starterModels';

export interface ProjectIpcOptions {
  projectStore: ProjectStore;
  openEditorWindow: (rootPath: string) => unknown;
  ownsProject?: (sender: WebContents, rootPath: string) => boolean;
  onPersisted?: (
    model: PersistedModel,
    isCurrent: () => boolean,
    publish: (status: ArtifactStatus) => void,
  ) => void;
}

/**
 * Registers the project IPC surface. The renderer can only read and write the
 * model source tree; dialogs and file watching stay in the main process.
 */
export const registerProjectIpc = ({
  projectStore,
  openEditorWindow,
  ownsProject = () => false,
  onPersisted,
}: ProjectIpcOptions) => {
  type Editor = {
    lane: ReturnType<typeof createLivePersistence>;
    watcher: ModelWatcher;
    artifacts?: ArtifactStatus;
    regenerate: () => void;
  };
  const editors = new Map<number, Editor>();
  const opening = new Map<
    number,
    { rootPath: string; result: Promise<OpenProjectResult> }
  >();
  const stop = (id: number) => {
    const editor = editors.get(id);
    if (!editor) return;
    editor.lane.dispose();
    editors.delete(id);
    void editor.watcher
      .close()
      .catch((error) => console.warn('[modelWatcher] Close failed:', error));
  };
  const attachCloseGuard = (sender: WebContents) => {
    const id = sender.id;
    const window = BrowserWindow.fromWebContents(sender);
    let closing = false;
    window?.on('close', (event) => {
      const editor = editors.get(id);
      if (!editor?.lane.hasPending()) return;
      event.preventDefault();
      if (closing) return;
      closing = true;
      void editor.lane.flush().then((result) => {
        closing = false;
        if (!result.success || window.isDestroyed()) return;
        window.close();
      });
    });
    sender.once('destroyed', () => stop(id));
  };

  const unavailable = {
    success: false,
    error: '当前窗口没有已加载的工作区版本。',
  } as const;

  ipcMain.handle(EVIDENCE_IPC_CHANNELS.showOpenDialog, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: '选择包含 .evidence/model 的工作区目录',
      buttonLabel: '打开工作区',
      properties: ['openDirectory'],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const rootPath = result.filePaths[0];

    if (result.canceled || rootPath === undefined) {
      return { success: false, canceled: true } as const;
    }

    return { success: true, rootPath } as const;
  });

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.showCreateDialog,
    async (event): Promise<CreateProjectDialogResult> => {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options: OpenDialogOptions = {
        title: '选择要初始化 .evidence 的工作区目录',
        buttonLabel: '在此新建模型',
        properties: ['openDirectory', 'createDirectory'],
      };
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);
      const targetPath = result.filePaths[0];

      if (result.canceled || targetPath === undefined) {
        return { success: false, canceled: true };
      }

      return { success: true, targetPath };
    },
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.create,
    async (_event, input: CreateProjectInput) => projectStore.create(input),
  );

  ipcMain.handle(EVIDENCE_IPC_CHANNELS.templates, async () => {
    try {
      return { success: true, templates: listProjectTemplates() } as const;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '无法读取新建模板。',
      } as const;
    }
  });

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.open,
    async ({ sender }, rootPath: string, reload?: 'discard-pending') => {
      if (typeof rootPath !== 'string') return unavailable;
      if (!ownsProject(sender, rootPath)) return projectStore.open(rootPath);
      const senderId = sender.id;
      const previous = editors.get(senderId);
      const active = opening.get(senderId);
      if (active?.rootPath === rootPath && reload === undefined)
        return active.result;
      if (
        active ||
        (previous?.lane.hasPending() && reload !== 'discard-pending')
      )
        return { success: false, error: '还有尚未写入磁盘的修改。' } as const;
      const load = async (): Promise<OpenProjectResult> => {
        try {
          await previous?.lane.pause();
          const result = await projectStore.open(rootPath);
          if (!result.success || sender.isDestroyed()) return result;
          if (!result.sourceDigest) return unavailable;
          const root = result.project.rootPath;
          const persistenceId = randomUUID();
          let generation = 0;
          let lastCommit: PersistedModel | undefined;
          const committed = (model: PersistedModel) => {
            lastCommit = model;
            const current = ++generation;
            onPersisted?.(
              model,
              () =>
                generation === current &&
                (!editors.has(senderId) ||
                  editors.get(senderId)?.lane === lane),
              (status) => {
                const editor = editors.get(senderId);
                if (editor?.lane !== lane || generation !== current) return;
                editor.artifacts = status;
                send(EVIDENCE_IPC_CHANNELS.artifactStatus, status);
              },
            );
          };
          const send = (channel: string, payload: object) => {
            if (!sender.isDestroyed()) sender.send(channel, payload);
          };
          const lane = createLivePersistence({
            id: persistenceId,
            rootPath: root,
            sourceDigest: result.sourceDigest,
            write: (document, digest) =>
              projectStore.write(root, document, digest),
            publish: (status) =>
              send(EVIDENCE_IPC_CHANNELS.persistenceStatus, status),
            committed,
          });
          const check = async () => {
            if (await lane.matchesDisk(() => projectStore.fingerprint(root)))
              return;
            if (editors.get(senderId)?.lane !== lane || sender.isDestroyed())
              return;
            ++generation;
            lane.markExternalChange();
            send(STORY_IPC_CHANNELS.INVALIDATED, { rootPath: root });
          };
          const watcher = watchModelSource(
            modelSourceOf(root),
            () => void check(),
          );
          if (previous) stop(senderId);
          else attachCloseGuard(sender);
          editors.set(senderId, {
            lane,
            watcher,
            regenerate: () => {
              if (lastCommit && lane.status().kind === 'persisted')
                committed(lastCommit);
            },
          });
          void watcher.ready.then(check);
          committed({
            persistenceId,
            revision: 0,
            rootPath: root,
            sourceDigest: result.sourceDigest,
            document: result.document,
          });
          return { ...result, persistenceId };
        } finally {
          if (editors.get(senderId) === previous) previous?.lane.resume();
          opening.delete(senderId);
        }
      };
      const result = load();
      opening.set(senderId, { rootPath, result });
      return result;
    },
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.enqueuePersistence,
    ({ sender }, input: LivePersistenceInput) => {
      const lane = editors.get(sender.id)?.lane;
      if (
        !lane ||
        !ownsProject(sender, lane.rootPath) ||
        lane.id !== input?.persistenceId ||
        !Number.isSafeInteger(input.revision) ||
        input.revision < 1
      )
        return unavailable;
      const document = DomainModelDocumentSyntaxSchema.safeParse(
        input.document,
      );
      if (!document.success)
        return {
          success: false,
          error: `模型文件结构无效：${document.error.issues[0]?.message}`,
        } as const;
      return lane.enqueue({ ...input, document: document.data });
    },
  );
  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.readPersistenceStatus,
    ({ sender }, id: string) => {
      const lane = editors.get(sender.id)?.lane;
      return lane?.id === id ? lane.status() : null;
    },
  );
  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.readArtifactStatus,
    ({ sender }, id: string) => {
      const editor = editors.get(sender.id);
      return editor?.lane.id === id ? (editor.artifacts ?? null) : null;
    },
  );
  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.flushPersistence,
    async ({ sender }, id: string) => {
      const editor = editors.get(sender.id);
      if (
        !editor ||
        editor.lane.id !== id ||
        !ownsProject(sender, editor.lane.rootPath)
      )
        return unavailable;
      const hadPending = editor.lane.hasPending();
      const result = await editor.lane.flush();
      if (!hadPending && result.success) editor.regenerate();
      return result;
    },
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.openEditorWindow,
    async (_event, rootPath: string) => {
      openEditorWindow(rootPath);
    },
  );

  ipcMain.handle(EVIDENCE_IPC_CHANNELS.recent, async () => {
    try {
      return {
        success: true,
        projects: await projectStore.listRecent(),
      } as const;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '无法读取最近项目。',
      } as const;
    }
  });

  return {
    hasPending: () =>
      [...editors.values()].some(({ lane }) => lane.hasPending()),
    async drain() {
      const results = await Promise.all(
        [...editors.values()].map(({ lane }) => lane.flush()),
      );
      return results.every(({ success }) => success);
    },
  };
};
