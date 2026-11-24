import {
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
  type WebContents,
} from 'electron';

import { STORY_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/story';
import { EVIDENCE_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/ipc';
import type {
  CreateProjectDialogResult,
  CreateProjectInput,
  SaveProjectInput,
} from '@evidence-poc/desktop-contracts/projects';

import { watchModelSource, type ModelWatcher } from './modelWatcher';
import { modelSourceOf } from './modelSource';
import type { ProjectStore } from './projectStore';
import { listProjectTemplates } from './templates/starterModels';

export interface ProjectIpcOptions {
  projectStore: ProjectStore;
  openEditorWindow: (rootPath: string) => unknown;
}

/**
 * Registers the project IPC surface. The renderer can only read and write the
 * model source tree; dialogs and file watching stay in the main process.
 */
export const registerProjectIpc = ({
  projectStore,
  openEditorWindow,
}: ProjectIpcOptions): void => {
  const watchers = new Map<number, ModelWatcher>();

  const stopWatching = (webContentsId: number): void => {
    void watchers
      .get(webContentsId)
      ?.close()
      .catch((error) => console.warn('[modelWatcher] Close failed:', error));
    watchers.delete(webContentsId);
  };

  const startWatching = (sender: WebContents, rootPath: string): void => {
    stopWatching(sender.id);

    const watcher = watchModelSource(modelSourceOf(rootPath), (paths) => {
      if (sender.isDestroyed()) {
        stopWatching(sender.id);
        return;
      }

      sender.send(STORY_IPC_CHANNELS.INVALIDATED, { rootPath });
      sender.send(EVIDENCE_IPC_CHANNELS.changed, {
        rootPath,
        changedAt: new Date().toISOString(),
        paths,
      });
    });

    watchers.set(sender.id, watcher);
    sender.once('destroyed', () => stopWatching(sender.id));
  };

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
    async (event, input: CreateProjectInput) => {
      const result = await projectStore.create(input);

      if (result.success) {
        startWatching(event.sender, result.project.rootPath);
      }

      return result;
    },
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
    async (event, rootPath: string) => {
      const result = await projectStore.open(rootPath);

      if (result.success) {
        startWatching(event.sender, result.project.rootPath);
      }

      return result;
    },
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.save,
    async (_event, input: SaveProjectInput) =>
      projectStore.save(input.rootPath, input.document),
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
};
