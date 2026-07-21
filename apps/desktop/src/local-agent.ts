import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentRuntimeRequest, DiagramAgentEvent } from './agent-protocol';
import { parseDiagramAgentEvent } from './agent-protocol';

const CANCEL_TIMEOUT_MS = 5_000;

export interface LocalAgentOptions {
  executablePath: string;
  runtimeEntry: string;
  packaged: boolean;
  environment?: NodeJS.ProcessEnv;
}

interface ActiveAgent {
  child: ChildProcessWithoutNullStreams;
  cancelled: boolean;
}

export class LocalAgent {
  private readonly active = new Map<string, ActiveAgent>();

  constructor(private readonly options: LocalAgentOptions) {}

  async run(
    request: AgentRuntimeRequest,
    onEvent: (event: DiagramAgentEvent) => void,
  ): Promise<void> {
    if (this.active.has(request.id)) {
      throw new Error(`Agent request ${request.id} is already running.`);
    }
    if (!existsSync(this.options.runtimeEntry)) {
      throw new Error(
        `The local Agent runtime was not found at ${this.options.runtimeEntry}.`,
      );
    }

    const child = spawn(
      this.options.executablePath,
      [this.options.runtimeEntry],
      {
        cwd: dirname(this.options.runtimeEntry),
        env: {
          ...process.env,
          ...this.options.environment,
          ...(this.options.packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const active: ActiveAgent = { child, cancelled: false };
    this.active.set(request.id, active);

    try {
      await monitorAgent(child, request, onEvent, () => active.cancelled);
    } finally {
      if (this.active.get(request.id) === active) {
        this.active.delete(request.id);
      }
    }
  }

  async cancel(id: string): Promise<void> {
    const active = this.active.get(id);
    if (!active) {
      return;
    }
    active.cancelled = true;
    await stopChild(active.child);
  }

  async stop(): Promise<void> {
    await Promise.all([...this.active.keys()].map((id) => this.cancel(id)));
  }
}

function monitorAgent(
  child: ChildProcessWithoutNullStreams,
  request: AgentRuntimeRequest,
  onEvent: (event: DiagramAgentEvent) => void,
  cancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stdoutBuffer = '';
    let stderr = '';
    let completed = false;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const consumeLine = (line: string) => {
      if (!line.trim()) {
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        finish(new Error('The local Agent runtime emitted invalid JSON.'));
        void stopChild(child);
        return;
      }
      const event = parseDiagramAgentEvent(value);
      if (!event || event.id !== request.id) {
        finish(new Error('The local Agent runtime emitted an invalid event.'));
        void stopChild(child);
        return;
      }
      completed ||= event.event === 'complete';
      onEvent(event);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      while (true) {
        const lineEnd = stdoutBuffer.indexOf('\n');
        if (lineEnd < 0) {
          break;
        }
        const line = stdoutBuffer.slice(0, lineEnd);
        stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
        consumeLine(line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) => {
      if (stdoutBuffer.trim()) {
        consumeLine(stdoutBuffer);
      }
      if (settled) {
        return;
      }
      if (cancelled()) {
        finish();
        return;
      }
      if (!completed || code !== 0) {
        const detail = stderr.trim();
        finish(
          new Error(
            `The local Agent runtime exited unexpectedly (${signal ?? String(code)}).${detail ? ` ${detail}` : ''}`,
          ),
        );
        return;
      }
      finish();
    });

    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, CANCEL_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
