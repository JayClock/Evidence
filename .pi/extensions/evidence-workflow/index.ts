import { watchFile, unwatchFile } from 'node:fs';
import type { Stats } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ensureProjectDirs } from './artifacts';
import { registerCommands } from './commands';
import { readState, statePath, writeState } from './state';
import { registerTools } from './tools';
import type { MetaState } from './types';

const STATUS_KEY = 'evidence-workflow';
const STATE_WATCH_INTERVAL_MS = 250;

function statusLabel(state: MetaState): string {
  return `evidence:${state.phase}${state.pending_gate ? ':gate' : ''}`;
}

export default function evidenceWorkflowExtension(pi: ExtensionAPI) {
  let watchedStatePath: string | undefined;
  let stateChangeListener:
    | ((current: Stats, previous: Stats) => void)
    | undefined;

  const closeStateWatcher = () => {
    if (watchedStatePath && stateChangeListener) {
      unwatchFile(watchedStatePath, stateChangeListener);
    }
    watchedStatePath = undefined;
    stateChangeListener = undefined;
  };

  pi.on('session_start', (_event, ctx) => {
    closeStateWatcher();
    ensureProjectDirs(ctx.cwd);

    const currentStatePath = statePath(ctx.cwd);
    const state = writeState(ctx.cwd, readState(ctx.cwd));
    ctx.ui.setStatus(STATUS_KEY, statusLabel(state));

    const refreshStatus = () => {
      try {
        ctx.ui.setStatus(STATUS_KEY, statusLabel(readState(ctx.cwd)));
      } catch (error) {
        ctx.ui.setStatus(STATUS_KEY, 'evidence:state-error');
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    };

    watchedStatePath = currentStatePath;
    stateChangeListener = (current, previous) => {
      if (current.mtimeMs === previous.mtimeMs) return;
      refreshStatus();
    };
    watchFile(
      currentStatePath,
      { interval: STATE_WATCH_INTERVAL_MS, persistent: false },
      stateChangeListener,
    );
  });

  pi.on('session_shutdown', () => {
    closeStateWatcher();
  });

  registerCommands(pi);
  registerTools(pi);
}
