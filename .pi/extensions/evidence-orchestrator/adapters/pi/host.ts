import { existsSync, watchFile, unwatchFile } from 'node:fs';
import type { Stats } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ensureProjectDirs } from '../../iteration/artifact-inventory';
import { iterationRoot } from '../../iteration/artifact-layout';
import { registerCommands } from './commands';
import { registerInboxCommands } from './inbox-commands';
import type { ActivityExecutionDetails } from './activity/execution';
import {
  renderActivityAgentResult,
  renderActivityResultEntry,
  type ActivityResultEntryData,
} from './activity/activity-agent-renderer';
import {
  ACTIVITY_RESULT_ENTRY_TYPE,
  ACTIVITY_RESULT_MESSAGE_TYPE,
  STATUS_KEY,
} from './identity';
import { registerTools, syncActiveTools } from './tools';
import { registerActivityToolGuard } from './activity/tool-guard';
import { NEXT_STEP_WIDGET_KEY } from './next-step';
import { boardPath, readBoard } from '../../iteration/board-repository';
import {
  readPersistedState,
  statePath,
} from '../../iteration/state-repository';
import { boardStatusProjection } from './status';

const STATE_WATCH_INTERVAL_MS = 250;

export default function evidenceOrchestratorExtension(pi: ExtensionAPI) {
  registerActivityToolGuard(pi);

  const watchers = new Map<string, (current: Stats, previous: Stats) => void>();

  const closeWatchers = () => {
    for (const [path, listener] of watchers) unwatchFile(path, listener);
    watchers.clear();
  };

  pi.on('session_start', (_event, ctx) => {
    closeWatchers();
    let refreshing = false;
    const refreshStatus = () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const board = readBoard(ctx.cwd);
        for (const item of board.items) {
          if (item.lifecycle !== 'active' || !existsSync(item.worktree_path)) {
            continue;
          }
          const state = readPersistedState(item.worktree_path);
          if (state) {
            ensureProjectDirs(
              item.worktree_path,
              iterationRoot(item.worktree_path, state),
            );
          }
        }
        const projection = boardStatusProjection(ctx.cwd);
        ctx.ui.setStatus(
          STATUS_KEY,
          `orchestrator:active=${projection.active}/${projection.max_active || '?'}:delivery=${projection.lane_counts.delivery}/${projection.lane_limits.delivery ?? '?'}`,
        );
        ctx.ui.setWidget(
          NEXT_STEP_WIDGET_KEY,
          [
            `Evidence · Active ${projection.active}/${projection.max_active || '?'} · run /evidence-status for the Board`,
          ],
          { placement: 'belowEditor' },
        );
        syncActiveTools(pi, ctx.cwd);

        const desiredPaths = new Set([
          boardPath(ctx.cwd),
          ...board.items
            .filter(({ lifecycle }) => lifecycle === 'active')
            .map(({ worktree_path }) => statePath(worktree_path)),
        ]);
        for (const [path, listener] of watchers) {
          if (desiredPaths.has(path)) continue;
          unwatchFile(path, listener);
          watchers.delete(path);
        }
        for (const path of desiredPaths) {
          if (watchers.has(path)) continue;
          const listener = (current: Stats, previous: Stats) => {
            if (current.mtimeMs !== previous.mtimeMs) refreshStatus();
          };
          watchers.set(path, listener);
          watchFile(
            path,
            { interval: STATE_WATCH_INTERVAL_MS, persistent: false },
            listener,
          );
        }
      } catch (error) {
        ctx.ui.setStatus(STATUS_KEY, 'orchestrator:board-error');
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      } finally {
        refreshing = false;
      }
    };
    refreshStatus();
  });

  pi.on('session_shutdown', (_event, ctx) => {
    closeWatchers();
    ctx.ui.setWidget(NEXT_STEP_WIDGET_KEY, undefined);
  });

  pi.registerEntryRenderer<ActivityResultEntryData>(
    ACTIVITY_RESULT_ENTRY_TYPE,
    (entry, options, theme) =>
      renderActivityResultEntry(
        entry.data ?? {
          version: 1,
          activity: 'pair',
          status: 'failed',
          agent: 'unknown',
          requested_model: 'unknown',
          actual_model: 'unknown',
          thinking: 'off',
          output_summary: 'Activity result entry is missing data.',
          usage: {
            turns: 0,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cost_usd: null,
            context_tokens_at_end: null,
          },
          duration_ms: 0,
          exit_code: 1,
          completed_at: new Date(0).toISOString(),
          child_event_count: 0,
          references: [],
        },
        { expanded: options.expanded },
        theme,
      ),
  );

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
