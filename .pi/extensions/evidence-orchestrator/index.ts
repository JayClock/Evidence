import { watchFile, unwatchFile } from 'node:fs';
import type { Stats } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ensureProjectDirs } from './evidence/artifact-index';
import { iterationRoot } from './workflow/iteration-paths';
import { registerCommands } from './runtime/commands';
import type { PhaseExecutionDetails } from './runtime/phase-execution';
import { renderPhaseSubagentResult } from './runtime/phase-subagent-renderer';
import {
  PHASE_RESULT_MESSAGE_TYPE,
  STATUS_KEY,
  statusLabel,
} from './runtime/identity';
import { registerTools } from './runtime/tools';
import { readState, statePath, writeState } from './workflow/state-store';

const STATE_WATCH_INTERVAL_MS = 250;

export default function evidenceOrchestratorExtension(pi: ExtensionAPI) {
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
    const currentStatePath = statePath(ctx.cwd);
    const state = writeState(ctx.cwd, readState(ctx.cwd));
    ensureProjectDirs(ctx.cwd, iterationRoot(ctx.cwd, state));
    ctx.ui.setStatus(STATUS_KEY, statusLabel(state));

    const refreshStatus = () => {
      try {
        ctx.ui.setStatus(STATUS_KEY, statusLabel(readState(ctx.cwd)));
      } catch (error) {
        ctx.ui.setStatus(STATUS_KEY, statusLabel(undefined, 'state-error'));
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

  pi.registerMessageRenderer<PhaseExecutionDetails>(
    PHASE_RESULT_MESSAGE_TYPE,
    (message, options, theme) =>
      renderPhaseSubagentResult(
        {
          content: [{ type: 'text', text: message.content }],
          details: message.details,
        },
        { expanded: options.expanded, isPartial: false },
        theme,
      ),
  );

  registerCommands(pi);
  registerTools(pi);
}
