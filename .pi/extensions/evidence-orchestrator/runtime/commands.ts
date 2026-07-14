import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import {
  checkIssueSourceDriftAsync,
  startIterationFromIssueAsync,
  syncIssueSourceAsync,
} from '../requirements/github-issue';
import { answerGate } from '../workflow/gates';
import { PHASE_ORDER } from '../workflow/phase-catalog';
import { readState } from '../workflow/state-store';
import type { Phase } from '../workflow/types';
import { PHASE_RESULT_MESSAGE_TYPE, STATUS_KEY, statusLabel } from './identity';
import {
  isCompletedIteration,
  PhaseRunBlockedError,
  preparePhaseRun,
  type PreparedPhaseRun,
} from './phase-dispatch';
import {
  executePreparedPhaseRun,
  type PhaseExecutionDetails,
} from './phase-execution';
import { createGitHubCliRunner } from './github-cli';
import { selectOrCreateGitHubIssue } from './issue-picker';
import { runWithLoader } from './loading';
import { runWithPhaseProgress } from './phase-progress';
import { statusMarkdown } from './status';

async function waitForIdle(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.isIdle()) await ctx.waitForIdle();
}

async function runPreparedPhaseFromCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  preparation: PreparedPhaseRun,
  invocation: string,
): Promise<PhaseExecutionDetails | undefined> {
  const details = await runWithPhaseProgress(
    ctx,
    `Running Evidence ${preparation.phase} phase…`,
    (signal, onUpdate) =>
      executePreparedPhaseRun(ctx, preparation, {
        invocation,
        signal,
        onUpdate,
      }),
  );
  if (!details) {
    ctx.ui.notify(
      `Evidence ${preparation.phase} phase execution cancelled.`,
      'info',
    );
    return undefined;
  }
  pi.sendMessage({
    customType: PHASE_RESULT_MESSAGE_TYPE,
    content: details.output,
    display: true,
    details,
  });
  if (details.exitCode !== 0) {
    ctx.ui.notify(
      `Evidence ${details.phase} phase failed with exit ${details.exitCode}.`,
      'error',
    );
  }
  return details;
}

function parseArgs(args: string): {
  phase?: string;
  dryRun: boolean;
  storyId?: string;
  scenarioId?: string;
  rest: string;
} {
  const parsed: {
    phase?: string;
    dryRun: boolean;
    storyId?: string;
    scenarioId?: string;
    rest: string;
  } = { dryRun: false, rest: '' };
  const rest: string[] = [];
  for (const part of args.split(/\s+/).filter(Boolean)) {
    if (part === '--dry-run') parsed.dryRun = true;
    else if (part.startsWith('--phase='))
      parsed.phase = part.slice('--phase='.length);
    else if (part.startsWith('--story='))
      parsed.storyId = part.slice('--story='.length);
    else if (part.startsWith('--scenario='))
      parsed.scenarioId = part.slice('--scenario='.length);
    else if (PHASE_ORDER.includes(part as Phase)) parsed.phase = part;
    else rest.push(part);
  }
  parsed.rest = rest.join(' ');
  return parsed;
}

export function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand('evidence-status', {
    description: 'Show the Evidence feedback loop and active evidence',
    handler: async (_args, ctx) =>
      ctx.ui.notify(statusMarkdown(ctx.cwd), 'info'),
  });

  pi.registerCommand('evidence-new', {
    description: 'Select or create a GitHub Issue and run single-Story Kickoff',
    handler: async (_args, ctx) => {
      try {
        await waitForIdle(ctx);
        const issueNumber = await selectOrCreateGitHubIssue(
          pi,
          ctx,
          (message, operation) =>
            runWithLoader(ctx, message, (signal) => operation(signal)),
        );
        if (!issueNumber) {
          ctx.ui.notify('New iteration cancelled.', 'info');
          return;
        }
        const state = await runWithLoader(
          ctx,
          `正在冻结 GitHub Issue #${issueNumber} 并创建 iteration…`,
          (signal) =>
            startIterationFromIssueAsync(
              ctx.cwd,
              { issueNumber },
              createGitHubCliRunner(pi),
              signal,
            ),
        );
        if (!state) {
          ctx.ui.notify('New iteration cancelled.', 'info');
          return;
        }
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          `Started ${state.iteration_id} from ${state.requirement_source?.repository}#${state.requirement_source?.issue_number}; running Kickoff.`,
          'info',
        );
        const preparation = preparePhaseRun(ctx.cwd);
        if (isCompletedIteration(preparation)) {
          ctx.ui.notify(preparation.task, 'info');
          return;
        }
        await runPreparedPhaseFromCommand(
          pi,
          ctx,
          preparation,
          '/evidence-new',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-issue-sync', {
    description: 'Refresh the frozen Issue snapshot during Kickoff only',
    handler: async (_args, ctx) => {
      try {
        const state = await runWithLoader(
          ctx,
          '正在刷新 GitHub Issue 快照…',
          (signal) =>
            syncIssueSourceAsync(ctx.cwd, createGitHubCliRunner(pi), signal),
        );
        if (!state) {
          ctx.ui.notify('Issue refresh cancelled.', 'info');
          return;
        }
        ctx.ui.notify(
          `Issue snapshot refreshed: ${state.requirement_source?.repository}#${state.requirement_source?.issue_number}.`,
          'info',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-issue-status', {
    description:
      'Check whether the live GitHub Issue differs from its snapshot',
    handler: async (_args, ctx) => {
      try {
        const drift = await runWithLoader(
          ctx,
          '正在检查 GitHub Issue 是否变化…',
          (signal) =>
            checkIssueSourceDriftAsync(
              ctx.cwd,
              createGitHubCliRunner(pi),
              signal,
            ),
        );
        if (!drift) {
          ctx.ui.notify('Issue drift check cancelled.', 'info');
          return;
        }
        ctx.ui.notify(
          drift.changed
            ? `Issue changed after snapshot: ${drift.snapshot_hash} → ${drift.remote_hash}. Refresh during Kickoff or start a new iteration.`
            : `Issue snapshot is current: ${drift.snapshot_hash}.`,
          drift.changed ? 'warning' : 'info',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-gate', {
    description:
      'Answer the pending human feedback point: approve|revise|reject <reason>',
    handler: async (args, ctx) => {
      const decision = args.trim();
      if (!decision) {
        ctx.ui.notify(
          'Usage: /evidence-gate approve|revise|reject <reason>',
          'info',
        );
        return;
      }
      const state = readState(ctx.cwd);
      if (!state.pending_gate) {
        ctx.ui.notify('No pending feedback Gate.', 'info');
        return;
      }
      try {
        answerGate(ctx.cwd, state.pending_gate, decision);
        ctx.ui.notify(`Gate answered: ${state.pending_gate}`, 'info');
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-run', {
    description:
      'Run the current phase; Build accepts --story=US-xxx --scenario=SC-xxx',
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      try {
        await waitForIdle(ctx);
        const preparation = preparePhaseRun(ctx.cwd, {
          requestedPhase: parsed.phase,
          instructions: parsed.rest,
          storyId: parsed.storyId,
          scenarioId: parsed.scenarioId,
        });
        if (parsed.dryRun || isCompletedIteration(preparation)) {
          ctx.ui.notify(preparation.task, 'info');
          return;
        }
        await runPreparedPhaseFromCommand(
          pi,
          ctx,
          preparation,
          `/evidence-run ${args}`.trim(),
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          error instanceof PhaseRunBlockedError ? 'info' : 'error',
        );
      }
    },
  });
}
