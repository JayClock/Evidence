import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { basename, join } from 'node:path';

export class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('DevTools connection closed.'));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      const timeout = setTimeout(
        () => rejectOpen(new Error('DevTools WebSocket timed out.')),
        10_000,
      );
      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolveOpen();
      });
      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        rejectOpen(new Error('DevTools WebSocket failed.'));
      });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}, timeoutMs = 10 * 60 * 1_000) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolveResult, rejectResult) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectResult(new Error(`DevTools ${method} timed out.`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve(value) {
          clearTimeout(timeout);
          resolveResult(value);
        },
        reject(error) {
          clearTimeout(timeout);
          rejectResult(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text ??
          'Renderer evaluation failed.',
      );
    }
    return response.result?.value;
  }

  async closeBrowser() {
    await this.send('Browser.close', {}, 10_000);
  }

  close() {
    this.socket.close();
  }
}

export function packagedRuntime(root) {
  if (process.platform === 'darwin') {
    const app = join(root, `mac-${process.arch}`, 'Evidence.app', 'Contents');
    return {
      executable: join(app, 'MacOS', 'Evidence'),
      resources: join(app, 'Resources'),
    };
  }
  if (process.platform === 'win32') {
    const application = join(root, 'win-unpacked');
    return {
      executable: join(application, 'Evidence.exe'),
      resources: join(application, 'resources'),
    };
  }
  const application = join(root, 'linux-unpacked');
  return {
    executable: join(application, 'evidence'),
    resources: join(application, 'resources'),
  };
}

export async function git(cwd, args) {
  const result = await runProcess(
    'git',
    args,
    cwd,
    operatingSystemEnvironment(),
    60_000,
  );
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.output}`);
  }
  return result.output;
}

export async function gitHead(cwd) {
  return (await git(cwd, ['rev-parse', 'HEAD'])).trim().toLowerCase();
}

export function packageManager() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

export function operatingSystemEnvironment(source = process.env) {
  const environment = {};
  for (const key of [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'APPDATA',
    'LOCALAPPDATA',
    'USERPROFILE',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME',
    'DISPLAY',
  ]) {
    if (source[key] !== undefined) environment[key] = source[key];
  }
  for (const [key, value] of Object.entries(source)) {
    if ((key === 'LANG' || key.startsWith('LC_')) && value !== undefined) {
      environment[key] = value;
    }
  }
  return environment;
}

export async function runChecked(command, args, cwd, environment, timeoutMs) {
  const result = await runProcess(command, args, cwd, environment, timeoutMs);
  if (result.exitCode !== 0) {
    throw new Error(
      `${basename(command)} ${args.join(' ')} exited with ${String(result.exitCode)}.\n${result.output}`,
    );
  }
  return result.output;
}

export function runProcess(command, args, cwd, environment, timeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    const append = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-100_000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`${command} timed out.\n${output}`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectRun(error);
    });
    child.once('exit', (exitCode) => {
      clearTimeout(timeout);
      resolveRun({ exitCode, output });
    });
  });
}

export async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await waitForExit(child, 5_000).catch(() => undefined);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
    await waitForExit(child, 2_000).catch(() => undefined);
  }
}

export function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(
      () => rejectExit(new Error('Child process did not exit.')),
      timeoutMs,
    );
    child.once('exit', () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}

export async function waitForHttp(url, child, output, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before health check.\n${output()}`);
    }
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}.\n${output()}`);
}

export function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const serverInstance = createNetServer();
    serverInstance.once('error', rejectPort);
    serverInstance.listen(0, '127.0.0.1', () => {
      const address = serverInstance.address();
      if (!address || typeof address === 'string') {
        rejectPort(new Error('Could not reserve a TCP port.'));
        return;
      }
      serverInstance.close((error) =>
        error ? rejectPort(error) : resolvePort(address.port),
      );
    });
  });
}

export function listen(serverInstance) {
  return new Promise((resolveListen, rejectListen) => {
    serverInstance.once('error', rejectListen);
    serverInstance.listen(0, '127.0.0.1', resolveListen);
  });
}

export function closeServer(serverInstance) {
  return new Promise((resolveClose) => {
    serverInstance.close(() => resolveClose());
  });
}

export function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        rejectBody(new Error('Fake Provider request exceeded 2 MiB.'));
        request.destroy();
      }
    });
    request.once('end', () => resolveBody(body));
    request.once('error', rejectBody);
  });
}

export function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is missing.`);
  }
  return value;
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
