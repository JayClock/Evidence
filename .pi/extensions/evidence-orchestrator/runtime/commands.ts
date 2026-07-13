import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import {
  answerClarification,
  selectClarificationStory,
} from '../requirements/clarifications';
import { answerGate } from '../workflow/gates';
import {
  checkIssueSourceDriftAsync,
  startIterationFromIssueAsync,
  syncIssueSourceAsync,
} from '../requirements/github-issue';
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
import {
  listSelectableClarificationStories,
  selectClarificationStoryInteractively,
} from './story-picker';

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
  const parts = args.split(/\s+/).filter(Boolean);
  const parsed = { dryRun: false, rest: '' } as {
    phase?: string;
    dryRun: boolean;
    storyId?: string;
    scenarioId?: string;
    rest: string;
  };
  const rest: string[] = [];
  for (const part of parts) {
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
    description:
      'Show Evidence Orchestrator phase, gate, artifacts, and code status',
    handler: async (_args, ctx) =>
      ctx.ui.notify(statusMarkdown(ctx.cwd), 'info'),
  });

  pi.registerCommand('evidence-new', {
    description: 'Select or create a GitHub Issue and start a new iteration',
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
          `正在冻结 GitHub Issue #${issueNumber} 并创建迭代…`,
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
          `Evidence Orchestrator started ${state.iteration_id} from ${state.requirement_source?.repository}#${state.requirement_source?.issue_number}; running frame now.`,
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
    description:
      'Refresh the active GitHub Issue snapshot while the iteration is in frame',
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
            ? `Issue changed after snapshot: ${drift.snapshot_hash} → ${drift.remote_hash}. Refresh in frame or start a new iteration.`
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
    description: 'Answer the pending gate: /evidence-gate [decision text]',
    handler: async (args, ctx) => {
      const state = readState(ctx.cwd);
      if (!state.pending_gate) return ctx.ui.notify('No pending gate.', 'info');
      try {
        answerGate(
          ctx.cwd,
          state.pending_gate,
          args.trim() || '通过，进入下一阶段',
        );
        ctx.ui.notify(`Gate answered: ${state.pending_gate}`, 'info');
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-story', {
    description:
      'Select one generated US-xxx story and immediately run isolated clarification',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const current = readState(ctx.cwd);
        if (current.active_clarification_story) {
          ctx.ui.notify(
            `Clarification story ${current.active_clarification_story.story_id} is already active.`,
            'info',
          );
          return;
        }
        let storyId = args.trim().toUpperCase();
        if (!storyId) {
          storyId = (await selectClarificationStoryInteractively(ctx)) ?? '';
          if (!storyId) {
            ctx.ui.notify('Story selection cancelled.', 'info');
            return;
          }
        }
        const state = selectClarificationStory(ctx.cwd, storyId);
        const preparation = preparePhaseRun(ctx.cwd);
        if (isCompletedIteration(preparation)) {
          ctx.ui.notify(preparation.task, 'info');
          return;
        }
        ctx.ui.notify(
          `Selected clarification story ${state.active_clarification_story?.story_id}; running clarify now.`,
          'info',
        );
        await runPreparedPhaseFromCommand(
          pi,
          ctx,
          preparation,
          `/evidence-story ${storyId}`,
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-answer', {
    description:
      'Answer the single pending TQA clarification: /evidence-answer <answer>',
    handler: async (args, ctx) => {
      try {
        const state = answerClarification(ctx.cwd, args);
        ctx.ui.notify(
          `Answered clarification. Recorded exchanges: ${state.clarification_history?.length ?? 0}.`,
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

  pi.registerCommand('evidence-run', {
    description:
      'Run the current phase; clarify accepts --story=US-xxx and coding also requires --scenario=SC-xxx',
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      try {
        await waitForIdle(ctx);
        const current = readState(ctx.cwd);
        if (
          current.phase === 'clarify' &&
          !current.active_clarification_story &&
          !current.pending_gate &&
          !current.halted &&
          !parsed.dryRun &&
          !parsed.storyId &&
          listSelectableClarificationStories(ctx.cwd).length > 0
        ) {
          const selectedStory =
            await selectClarificationStoryInteractively(ctx);
          if (!selectedStory) {
            ctx.ui.notify('Story selection cancelled.', 'info');
            return;
          }
          selectClarificationStory(ctx.cwd, selectedStory);
        }
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
