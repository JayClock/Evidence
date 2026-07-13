import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  answerClarification,
  selectClarificationStory,
} from '../requirements/clarifications';
import { answerGate } from '../workflow/gates';
import {
  checkIssueSourceDrift,
  startIterationFromIssue,
  syncIssueSource,
} from '../requirements/github-issue';
import { PHASE_ORDER } from '../workflow/phase-catalog';
import { readState } from '../workflow/state-store';
import type { Phase } from '../workflow/types';
import { STATUS_KEY, statusLabel } from './identity';
import {
  foregroundPhaseRequest,
  isCompletedIteration,
  PhaseRunBlockedError,
  preparePhaseRun,
} from './phase-dispatch';
import { selectOrCreateGitHubIssue } from './issue-picker';
import { statusMarkdown } from './status';
import {
  listSelectableClarificationStories,
  selectClarificationStoryInteractively,
} from './story-picker';

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
        const issueNumber = await selectOrCreateGitHubIssue(pi, ctx);
        if (!issueNumber) {
          ctx.ui.notify('New iteration cancelled.', 'info');
          return;
        }
        const state = startIterationFromIssue(ctx.cwd, { issueNumber });
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          `Evidence Orchestrator started ${state.iteration_id} from ${state.requirement_source?.repository}#${state.requirement_source?.issue_number}.`,
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

  pi.registerCommand('evidence-issue-sync', {
    description:
      'Refresh the active GitHub Issue snapshot while the iteration is in frame',
    handler: async (_args, ctx) => {
      try {
        const state = syncIssueSource(ctx.cwd);
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
        const drift = checkIssueSourceDrift(ctx.cwd);
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
      'Select one generated US-xxx story and immediately queue isolated clarification',
    handler: async (args, ctx) => {
      try {
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
        const request = foregroundPhaseRequest('');
        if (ctx.isIdle()) {
          pi.sendUserMessage(request);
        } else {
          pi.sendUserMessage(request, { deliverAs: 'followUp' });
        }
        ctx.ui.notify(
          `Selected clarification story ${state.active_clarification_story?.story_id} and queued visible clarify execution.`,
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
      'Queue the current phase; clarify accepts --story=US-xxx and coding also requires --scenario=SC-xxx',
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      try {
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

        const request = foregroundPhaseRequest(parsed.rest);
        if (ctx.isIdle()) {
          pi.sendUserMessage(request);
        } else {
          pi.sendUserMessage(request, { deliverAs: 'followUp' });
        }
        ctx.ui.notify(
          `Queued visible ${preparation.phase} phase execution in this conversation.`,
          'info',
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
