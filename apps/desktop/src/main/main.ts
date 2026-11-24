import path from 'node:path';
import {
  checkWorkspacePath,
  openWorkspace,
} from '@evidence-poc/evidence-model-io';

import { app, BrowserWindow, nativeTheme } from 'electron';
import { AiConfigService } from './ai/aiConfigService';
import { registerAiConfigIpc } from './ai/aiConfigIpc';
import {
  getEvidenceMcpBridgeEndpoint,
  runEvidenceMcpStdio,
} from '@evidence-poc/evidence-mcp';

import { EVIDENCE_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/ipc';
import { EVIDENCE_MCP_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/mcpIpc';
import { registerAgentIpc } from './agentIpcHandlers';
import { startMcpBridgeRuntime } from './mcpBridgeRuntime';
import { registerMcpIpc } from './mcpIpcHandlers';
import { createMcpRequestHandler } from './mcpRequestHandler';
import {
  mcpClientConfigs,
  synchronizeEvidenceMcpRegistration,
} from './mcpRegistration';
import { createMcpDeliveryService } from './mcpDeliveryService';
import { createMcpSensorService } from './mcpSensorService';
import { registerIngestionIpc } from './ingestionIpc';
import { createModelIngestionReader } from './ingestionModelReader';
import { registerDeliveryIpc } from './deliveryIpc';
import { createContextDeliveryReactor } from './contextDeliveryReactor';
import { registerProjectIpc } from './projectIpc';
import { registerStoryIpc } from './storyIpc';
import { createProjectStore, RECENT_PROJECTS_FILE } from './projectStore';
import {
  createDashboardWindow,
  listEditorWindows,
  openEditorWindow,
  ownsEditorProject,
} from './windows';

const isMac = process.platform === 'darwin';
const isMcpStdioMode = process.argv.includes('--mcp-stdio');

/**
 * `--mcp-stdio` runs the MCP server as a headless process.
 *
 * External clients start this binary themselves, so it must not open a window,
 * read the project store or register anything: it only forwards tool calls to the
 * already running app over the local socket.
 */
const startMcpStdioCommand = async (): Promise<void> => {
  const endpoint =
    process.env.EVIDENCE_MCP_ENDPOINT ??
    getEvidenceMcpBridgeEndpoint({
      platform: process.platform,
      userDataPath: app.getPath('userData'),
    });

  try {
    await runEvidenceMcpStdio({ endpoint });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'MCP stdio server failed.'}\n`,
    );
    app.exit(1);
  }
};

const startApplication = async (): Promise<void> => {
  const projectStore = createProjectStore({
    recentProjectsFile: path.join(
      app.getPath('userData'),
      RECENT_PROJECTS_FILE,
    ),
  });

  const { getAgentDir } = await import('@earendil-works/pi-coding-agent');
  const aiConfig = new AiConfigService({
    agentDir: path.resolve(getAgentDir()),
  });
  const getModelOptions = () => aiConfig.getModelOptions();
  const delivery = createContextDeliveryReactor();
  const agentIpc = registerAgentIpc({
    getModelOptions,
    sessionDirectoryFor(rootPath, sender) {
      if (!ownsEditorProject(sender, rootPath))
        throw new Error('当前窗口未打开此工作区。');
      const { root, cache } = openWorkspace(rootPath);
      const directory = path.join(cache, 'sessions');
      checkWorkspacePath(root, directory, 'directory');
      return directory;
    },
    onLiveModelChanged: (sender, input) => {
      if (!ownsEditorProject(sender, input.rootPath)) return;
      delivery.schedule(sender.id, input, (event) => {
        if (ownsEditorProject(sender, event.rootPath))
          sender.send(EVIDENCE_IPC_CHANNELS.deliveryStatus, event);
      });
    },
    onEditorDetached: (sender, rootPath) =>
      delivery.cancel(sender.id, rootPath),
  });

  registerProjectIpc({ projectStore, openEditorWindow });
  registerIngestionIpc({
    projectStore,
    generate: createModelIngestionReader({ getModelOptions }),
    openEditorWindow,
  });
  const storyIpc = registerStoryIpc({
    getModelOptions,
    ownsProject: ownsEditorProject,
  });
  const aiConfigIpc = registerAiConfigIpc(aiConfig, async () => {
    storyIpc.resetModels();
    await agentIpc.resetModels();
  });
  app.once('before-quit', () => aiConfigIpc.dispose());
  app.once('before-quit', () => storyIpc.dispose());
  registerDeliveryIpc();
  app.once('before-quit', () => agentIpc.dispose());

  const endpoint = getEvidenceMcpBridgeEndpoint({
    platform: process.platform,
    userDataPath: app.getPath('userData'),
  });
  const registration = await synchronizeEvidenceMcpRegistration({
    endpoint,
    executablePath: process.execPath,
    configs: mcpClientConfigs({ platform: process.platform }),
  }).catch(() => ({ updated: [], skipped: [], failed: [] }));

  const runtime = await startMcpBridgeRuntime({
    endpoint,
    getActiveContents: () => {
      const [active] = listEditorWindows();

      return active?.webContents ?? null;
    },
    createHandler: ({ renderer, capture, onCall }) =>
      createMcpRequestHandler({
        renderer,
        capture,
        sensors: createMcpSensorService(),
        delivery: createMcpDeliveryService(),
        onCall,
      }),
    publishStatus: (status) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(EVIDENCE_MCP_IPC_CHANNELS.status, status);
        }
      }
    },
    registeredClients: registration.updated,
  }).catch((error: unknown) => {
    process.stderr.write(
      `MCP bridge 未启动：${error instanceof Error ? error.message : '未知错误'}\n`,
    );

    return null;
  });

  if (runtime !== null) {
    const ipc = registerMcpIpc({ runtime });

    app.once('before-quit', () => {
      ipc.dispose();
      void runtime.dispose();
    });
  }

  createDashboardWindow();
};

if (isMcpStdioMode) {
  void app.whenReady().then(startMcpStdioCommand);
} else {
  if (isMac) {
    nativeTheme.themeSource = 'light';
  }

  void app.whenReady().then(startApplication);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDashboardWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (!isMac) {
      app.quit();
    }
  });
}
