import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  CANCEL_DIAGRAM_AGENT_CHANNEL,
  DIAGRAM_AGENT_EVENT_CHANNEL,
  parseDiagramAgentRequest,
  RUN_DIAGRAM_AGENT_CHANNEL,
} from './agent-protocol';
import { authorizedApiRequestHeaders } from './api-request-authorization';
import type {
  CodingAgentEvent,
  CodingAgentRuntimeRequest,
} from './coding-agent-protocol';
import { parseCodingAgentEvent } from './coding-agent-protocol';
import { CodingController } from './coding-controller';
import {
  ACCEPT_CODING_RUN_CHANNEL,
  CANCEL_CODING_AGENT_CHANNEL,
  CODING_AGENT_EVENT_CHANNEL,
  GET_CODING_REVIEW_CHANNEL,
  parseCodingRunDecisionRequest,
  parseCodingRunId,
  parseCodingRunRejectionRequest,
  parseStartCodingRequest,
  REJECT_CODING_RUN_CHANNEL,
  RUN_CODING_AGENT_CHANNEL,
} from './coding-ipc-protocol';
import { CodingRunClient } from './coding-run-client';
import { CodingWorktreeManager } from './coding-worktree';
import { isTrustedRendererRequest } from './ipc-security';
import { LocalAgent } from './local-agent';
import {
  resolveApiAuthorization,
  resolveApiBaseUrl,
  resolveWebUrl,
} from './runtime-config';
import { WorkspaceBindingStore } from './workspace-binding-store';

const APP_SCHEME = 'evidence';
const APP_URL = `${APP_SCHEME}://app/`;
const SMOKE_TEST = process.env.EVIDENCE_DESKTOP_SMOKE_TEST === '1';

let localAgent: LocalAgent | null = null;
let codingController: CodingController | null = null;
let allowQuit = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function packagedWebRoot(): string {
  return join(process.resourcesPath, 'web');
}

function resolveWebAsset(requestUrl: string): string {
  const webRoot = resolve(packagedWebRoot());
  const pathname = decodeURIComponent(new URL(requestUrl).pathname);
  const requested = resolve(webRoot, pathname.replace(/^\/+/, ''));
  const pathWithinRoot = relative(webRoot, requested);
  const isWithinRoot =
    pathWithinRoot === '' ||
    (!isAbsolute(pathWithinRoot) &&
      !pathWithinRoot.startsWith(`..${sep}`) &&
      pathWithinRoot !== '..');

  if (isWithinRoot && existsSync(requested) && statSync(requested).isFile()) {
    return requested;
  }
  return join(webRoot, 'index.html');
}

function registerWebProtocol(): void {
  protocol.handle(APP_SCHEME, (request) =>
    net.fetch(pathToFileURL(resolveWebAsset(request.url)).toString()),
  );
}

function expectedRendererUrl(): string {
  return app.isPackaged ? APP_URL : resolveWebUrl();
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const senderFrame = event.senderFrame;
  const trusted = isTrustedRendererRequest({
    senderUrl: senderFrame?.url,
    expectedUrl: expectedRendererUrl(),
    isMainFrame: senderFrame === event.sender.mainFrame,
  });
  if (!trusted) {
    throw new Error('Rejected IPC request from an untrusted renderer.');
  }
}

function registerDesktopBridge(
  apiBaseUrl: string,
  agent: LocalAgent,
  bindings: WorkspaceBindingStore,
  coding: CodingController,
): void {
  ipcMain.handle('evidence:get-api-base-url', (event) => {
    assertTrustedIpcSender(event);
    return apiBaseUrl;
  });
  ipcMain.handle('evidence:choose-directory', async (event) => {
    assertTrustedIpcSender(event);
    const selection = await dialog.showOpenDialog({
      title: 'Choose local project',
      properties: ['openDirectory', 'createDirectory'],
    });
    return selection.canceled ? null : (selection.filePaths[0] ?? null);
  });
  ipcMain.handle(
    'evidence:bind-workspace',
    async (event, input: unknown): Promise<void> => {
      assertTrustedIpcSender(event);
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Workspace binding input is required.');
      }
      const candidate = input as Record<string, unknown>;
      if (
        typeof candidate.workspaceId !== 'string' ||
        typeof candidate.repositoryRoot !== 'string'
      ) {
        throw new Error('Workspace binding input is invalid.');
      }
      await bindings.bind({
        apiBaseUrl,
        workspaceId: candidate.workspaceId,
        repositoryRoot: candidate.repositoryRoot,
      });
    },
  );
  ipcMain.handle(RUN_DIAGRAM_AGENT_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseDiagramAgentRequest(input);
    await agent.run({ ...request, apiBaseUrl }, (agentEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(DIAGRAM_AGENT_EVENT_CHANNEL, agentEvent);
      }
    });
  });
  ipcMain.handle(CANCEL_DIAGRAM_AGENT_CHANNEL, async (event, id: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof id !== 'string') {
      throw new Error('Agent request id is required.');
    }
    await agent.cancel(id);
  });
  ipcMain.handle(RUN_CODING_AGENT_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseStartCodingRequest(input);
    await coding.run(request, (codingEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(CODING_AGENT_EVENT_CHANNEL, codingEvent);
      }
    });
  });
  ipcMain.handle(CANCEL_CODING_AGENT_CHANNEL, async (event, id: unknown) => {
    assertTrustedIpcSender(event);
    await coding.cancel(parseCodingRunId(id));
  });
  ipcMain.handle(GET_CODING_REVIEW_CHANNEL, (event, runId: unknown) => {
    assertTrustedIpcSender(event);
    return coding.getReview(parseCodingRunId(runId));
  });
  ipcMain.handle(ACCEPT_CODING_RUN_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    return coding.accept(parseCodingRunDecisionRequest(input));
  });
  ipcMain.handle(REJECT_CODING_RUN_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    return coding.reject(parseCodingRunRejectionRequest(input));
  });
}

function registerRendererApiAuthorization(
  apiBaseUrl: string,
  authorization: string | undefined,
): void {
  if (!authorization) {
    return;
  }
  const apiOriginPattern = `${new URL(apiBaseUrl).origin}/*`;
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [apiOriginPattern] },
    (details, callback) => {
      callback({
        requestHeaders: authorizedApiRequestHeaders(
          details.url,
          details.requestHeaders,
          apiBaseUrl,
          authorization,
        ),
      });
    },
  );
}

function createLocalAgent(): LocalAgent {
  return new LocalAgent({
    executablePath: app.isPackaged
      ? process.execPath
      : (process.env.EVIDENCE_NODE_EXECUTABLE ?? 'node'),
    runtimeEntry: app.isPackaged
      ? join(
          process.resourcesPath,
          'app.asar.unpacked',
          'dist',
          'agent-runtime.js',
        )
      : join(__dirname, 'agent-runtime.js'),
    packaged: app.isPackaged,
  });
}

function createLocalCodingAgent(): LocalAgent<
  CodingAgentRuntimeRequest,
  CodingAgentEvent
> {
  return new LocalAgent({
    executablePath: app.isPackaged
      ? process.execPath
      : (process.env.EVIDENCE_NODE_EXECUTABLE ?? 'node'),
    runtimeEntry: app.isPackaged
      ? join(
          process.resourcesPath,
          'app.asar.unpacked',
          'dist',
          'coding-agent-runtime.js',
        )
      : join(__dirname, 'coding-agent-runtime.js'),
    packaged: app.isPackaged,
    parseEvent: parseCodingAgentEvent,
  });
}

async function connectRemoteApi(): Promise<string> {
  const apiBaseUrl = resolveApiBaseUrl();
  const healthUrl = new URL('/health', apiBaseUrl).toString();
  const response = await fetch(healthUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `Remote Evidence API health check returned ${response.status}.`,
    );
  }
  return apiBaseUrl;
}

function canOpenExternally(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function verifyPackagedRuntime(
  window: BrowserWindow,
  apiBaseUrl: string,
  authorization: string | undefined,
): Promise<void> {
  if (!SMOKE_TEST) {
    return;
  }

  const response = await fetch(`${apiBaseUrl}/users/desktop-user`, {
    headers: authorization ? { Authorization: authorization } : {},
  });
  if (!response.ok) {
    throw new Error(`Packaged API smoke check returned ${response.status}.`);
  }
  if (!window.webContents.getURL().startsWith(APP_URL)) {
    throw new Error('Packaged renderer did not load from evidence://app/.');
  }

  process.stdout.write('EVIDENCE_DESKTOP_SMOKE_READY\n');
}

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    title: 'Evidence',
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (canOpenExternally(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const destination = new URL(url);
    const allowed = app.isPackaged
      ? destination.protocol === `${APP_SCHEME}:` && destination.host === 'app'
      : destination.origin === new URL(resolveWebUrl()).origin;
    if (!allowed) {
      event.preventDefault();
      if (canOpenExternally(url)) {
        void shell.openExternal(url);
      }
    }
  });

  await window.loadURL(app.isPackaged ? APP_URL : resolveWebUrl());
  return window;
}

void app.whenReady().then(async () => {
  try {
    registerWebProtocol();
    const apiBaseUrl = await connectRemoteApi();
    const authorization = resolveApiAuthorization();
    registerRendererApiAuthorization(apiBaseUrl, authorization);
    localAgent = createLocalAgent();
    const localCodingAgent = createLocalCodingAgent();
    const bindings = new WorkspaceBindingStore(
      join(app.getPath('userData'), 'workspace-bindings.json'),
    );
    codingController = new CodingController(
      apiBaseUrl,
      bindings,
      new CodingWorktreeManager(
        join(app.getPath('userData'), 'coding-worktrees'),
      ),
      new CodingRunClient({ apiBaseUrl, authorization }),
      localCodingAgent,
    );
    registerDesktopBridge(apiBaseUrl, localAgent, bindings, codingController);
    const window = await createWindow();
    await verifyPackagedRuntime(window, apiBaseUrl, authorization);

    if (SMOKE_TEST) {
      app.quit();
      return;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (SMOKE_TEST) {
      process.stderr.write(`EVIDENCE_DESKTOP_SMOKE_FAILED: ${message}\n`);
    } else {
      dialog.showErrorBox('Evidence could not start', message);
    }
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (!allowQuit && (localAgent || codingController)) {
    event.preventDefault();
    allowQuit = true;
    void Promise.all([
      localAgent?.stop() ?? Promise.resolve(),
      codingController?.stop() ?? Promise.resolve(),
    ]).finally(() => app.quit());
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
