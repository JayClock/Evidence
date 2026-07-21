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
import { isTrustedRendererRequest } from './ipc-security';
import { LocalAgent } from './local-agent';
import { LocalServer, type LocalServerConnection } from './local-server';
import { resolveApiBaseUrl, resolveWebUrl } from './runtime-config';

const APP_SCHEME = 'evidence';
const APP_URL = `${APP_SCHEME}://app/`;
const DESKTOP_SESSION_HEADER = 'x-evidence-desktop-token';
const SMOKE_TEST = process.env.EVIDENCE_DESKTOP_SMOKE_TEST === '1';

interface RuntimeConnection {
  apiBaseUrl: string;
  sessionToken?: string;
}

let localAgent: LocalAgent | null = null;
let localServer: LocalServer | null = null;
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

function rendererOrigin(): string {
  return app.isPackaged ? 'evidence://app' : new URL(resolveWebUrl()).origin;
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

function registerDesktopBridge(apiBaseUrl: string, agent: LocalAgent): void {
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
}

function registerApiAuthentication(connection: LocalServerConnection): void {
  const apiOrigin = new URL(connection.apiBaseUrl).origin;
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`${apiOrigin}/*`] },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          [DESKTOP_SESSION_HEADER]: connection.sessionToken,
        },
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

function createLocalServer(): LocalServer {
  return new LocalServer({
    executablePath: app.isPackaged
      ? process.execPath
      : (process.env.EVIDENCE_NODE_EXECUTABLE ?? 'node'),
    serverEntry: app.isPackaged
      ? join(
          process.resourcesPath,
          'app.asar.unpacked',
          'dist',
          'server',
          'main.js',
        )
      : join(__dirname, '..', '..', 'server', 'dist-desktop', 'main.js'),
    legacyRegistryPath:
      process.env.EVIDENCE_LEGACY_REGISTRY_PATH ??
      join(
        app.getPath('appData'),
        'works.earendil.evidence',
        'evidence.sqlite',
      ),
    userDataPath:
      process.env.EVIDENCE_USER_DATA_PATH ?? app.getPath('userData'),
    rendererOrigin: rendererOrigin(),
    packaged: app.isPackaged,
    onUnexpectedExit: (error) => {
      if (!allowQuit) {
        dialog.showErrorBox('Evidence server stopped', error.message);
        app.quit();
      }
    },
  });
}

async function runtimeConnection(): Promise<RuntimeConnection> {
  if (process.env.EVIDENCE_API_BASE_URL?.trim()) {
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
    return { apiBaseUrl };
  }

  localServer = createLocalServer();
  return localServer.start();
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
  connection: RuntimeConnection,
): Promise<void> {
  if (!SMOKE_TEST) {
    return;
  }

  const response = await fetch(`${connection.apiBaseUrl}/users/desktop-user`, {
    headers: connection.sessionToken
      ? { [DESKTOP_SESSION_HEADER]: connection.sessionToken }
      : undefined,
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
    const connection = await runtimeConnection();
    if (connection.sessionToken) {
      registerApiAuthentication(connection as LocalServerConnection);
    }
    localAgent = createLocalAgent();
    registerDesktopBridge(connection.apiBaseUrl, localAgent);
    const window = await createWindow();
    await verifyPackagedRuntime(window, connection);

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
  if (!allowQuit && (localAgent || localServer)) {
    event.preventDefault();
    allowQuit = true;
    void Promise.all([localAgent?.stop(), localServer?.stop()]).finally(() =>
      app.quit(),
    );
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
