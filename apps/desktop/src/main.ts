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
import { isTrustedRendererRequest } from './ipc-security';
import { LocalServer, type LocalServerConnection } from './local-server';
import { resolveWebUrl } from './runtime-config';

const APP_SCHEME = 'evidence';
const APP_URL = `${APP_SCHEME}://app/`;
const DESKTOP_SESSION_HEADER = 'x-evidence-desktop-token';
const SMOKE_TEST = process.env.EVIDENCE_DESKTOP_SMOKE_TEST === '1';

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

function registerDesktopBridge(apiBaseUrl: string): void {
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
      : join(__dirname, '..', '..', 'server-nest', 'dist-desktop', 'main.js'),
    userDataPath:
      process.env.EVIDENCE_USER_DATA_PATH ?? app.getPath('userData'),
    rendererOrigin: rendererOrigin(),
    packaged: app.isPackaged,
  });
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
  connection: LocalServerConnection,
): Promise<void> {
  if (!SMOKE_TEST) {
    return;
  }

  const response = await fetch(`${connection.apiBaseUrl}/users/desktop-user`, {
    headers: {
      [DESKTOP_SESSION_HEADER]: connection.sessionToken,
    },
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
    localServer = createLocalServer();
    const connection = await localServer.start();
    registerApiAuthentication(connection);
    registerDesktopBridge(connection.apiBaseUrl);
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
  if (!allowQuit && localServer) {
    event.preventDefault();
    allowQuit = true;
    void localServer.stop().finally(() => app.quit());
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
