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
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { isTrustedRendererRequest } from './ipc-security';
import { resolveApiBaseUrl, resolveWebUrl } from './runtime-config';

const APP_SCHEME = 'evidence';
const APP_URL = `${APP_SCHEME}://app/`;

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

function registerDesktopBridge(): void {
  ipcMain.handle('evidence:get-api-base-url', (event) => {
    assertTrustedIpcSender(event);
    return resolveApiBaseUrl();
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

function canOpenExternally(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
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
  registerWebProtocol();
  registerDesktopBridge();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
