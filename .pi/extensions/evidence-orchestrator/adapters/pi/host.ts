import { watchFile, unwatchFile } from 'node:fs';
import type { Stats } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ensureProjectDirs } from '../../iteration/artifact-inventory';
import { iterationRoot } from '../../iteration/artifact-layout';
import { registerCommands } from './commands';
import { registerInboxCommands } from './inbox-commands';
import type { ActivityExecutionDetails } from './activity/execution';
import { renderActivityAgentResult } from './activity/activity-agent-renderer';
import {
  ACTIVITY_RESULT_MESSAGE_TYPE,
  STATUS_KEY,
  statusLabel,
} from './identity';
import { registerTools, syncActiveTools } from './tools';
import { NEXT_STEP_WIDGET_KEY, nextStepWidget } from './next-step';
import {
  readPersistedState,
  statePath,
} from '../../iteration/state-repository';

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
    const state = readPersistedState(ctx.cwd);
    if (state) ensureProjectDirs(ctx.cwd, iterationRoot(ctx.cwd, state));
    ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
    ctx.ui.setWidget(NEXT_STEP_WIDGET_KEY, nextStepWidget(ctx.cwd, state), {
      placement: 'belowEditor',
    });
    syncActiveTools(pi, state);

    const refreshStatus = () => {
      try {
        const state = readPersistedState(ctx.cwd);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.setWidget(NEXT_STEP_WIDGET_KEY, nextStepWidget(ctx.cwd, state), {
          placement: 'belowEditor',
        });
        syncActiveTools(pi, state);
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

  pi.on('session_shutdown', (_event, ctx) => {
    closeStateWatcher();
    ctx.ui.setWidget(NEXT_STEP_WIDGET_KEY, undefined);
  });

  pi.registerMessageRenderer<ActivityExecutionDetails>(
    ACTIVITY_RESULT_MESSAGE_TYPE,
    (message, options, theme) =>
      renderActivityAgentResult(
        {
          content: [{ type: 'text', text: message.content }],
          details: message.details,
        },
        { expanded: options.expanded, isPartial: false },
        theme,
      ),
  );

  registerInboxCommands(pi);
  registerCommands(pi);
  registerTools(pi);
}
