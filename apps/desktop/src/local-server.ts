import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const LOOPBACK_HOST = '127.0.0.1';
const STARTUP_TIMEOUT_MS = 15_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

export interface LocalServerOptions {
  executablePath: string;
  serverEntry: string;
  piEntry: string;
  userDataPath: string;
  rendererOrigin: string;
  packaged: boolean;
}

export interface LocalServerConnection {
  apiBaseUrl: string;
  sessionToken: string;
}

export function buildServerEnvironment(options: {
  port: number;
  sessionToken: string;
  userDataPath: string;
  rendererOrigin: string;
  packaged: boolean;
  piEntry: string;
}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(options.packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    EVIDENCE_STORAGE: 'sqlite',
    EVIDENCE_PI_ENTRY: options.piEntry,
    EVIDENCE_REGISTRY_PATH: join(
      options.userDataPath,
      'data',
      'registry.sqlite',
    ),
    EVIDENCE_DEFAULT_WORKSPACE_PATH: join(
      options.userDataPath,
      'data',
      'default-workspace',
    ),
    EVIDENCE_DESKTOP_SESSION_TOKEN: options.sessionToken,
    EVIDENCE_CORS_ORIGINS: options.rendererOrigin,
    EVIDENCE_HOST: LOOPBACK_HOST,
    PORT: String(options.port),
  };
}

export class LocalServer {
  private child: ChildProcess | null = null;

  constructor(private readonly options: LocalServerOptions) {}

  async start(): Promise<LocalServerConnection> {
    if (this.child) {
      throw new Error('The local Evidence server is already running.');
    }
    if (!existsSync(this.options.serverEntry)) {
      throw new Error(
        `The packaged Nest server was not found at ${this.options.serverEntry}.`,
      );
    }
    if (!existsSync(this.options.piEntry)) {
      throw new Error(
        `The embedded Pi CLI was not found at ${this.options.piEntry}.`,
      );
    }

    const port = await reserveLoopbackPort();
    const sessionToken = randomBytes(32).toString('base64url');
    const environment = buildServerEnvironment({
      port,
      sessionToken,
      userDataPath: this.options.userDataPath,
      rendererOrigin: this.options.rendererOrigin,
      packaged: this.options.packaged,
      piEntry: this.options.piEntry,
    });
    const child = spawn(
      this.options.executablePath,
      [this.options.serverEntry],
      {
        cwd: dirname(this.options.serverEntry),
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    this.child = child;
    child.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(`[server] ${chunk.toString()}`);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`[server] ${chunk.toString()}`);
    });

    const origin = `http://${LOOPBACK_HOST}:${port}`;
    try {
      await waitUntilHealthy(child, origin, sessionToken);
    } catch (error) {
      await this.stop();
      throw error;
    }

    return {
      apiBaseUrl: `${origin}/api`,
      sessionToken,
    };
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) {
      return;
    }

    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

async function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once('error', reject);
    reservation.listen(0, LOOPBACK_HOST, () => {
      const address = reservation.address();
      if (!address || typeof address === 'string') {
        reservation.close();
        reject(new Error('Could not reserve a loopback port.'));
        return;
      }
      reservation.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

async function waitUntilHealthy(
  child: ChildProcess,
  origin: string,
  sessionToken: string,
): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let spawnError: Error | null = null;
  child.once('error', (error) => {
    spawnError = error;
  });

  while (Date.now() < deadline) {
    if (spawnError) {
      throw spawnError;
    }
    if (child.exitCode !== null) {
      throw new Error(
        `The local Evidence server exited during startup (${child.exitCode}).`,
      );
    }

    try {
      const response = await fetch(`${origin}/health`, {
        headers: { 'x-evidence-desktop-token': sessionToken },
      });
      if (response.ok) {
        return;
      }
    } catch {
      // The server has not started listening yet.
    }
    await delay(100);
  }

  throw new Error('Timed out while starting the local Evidence server.');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
