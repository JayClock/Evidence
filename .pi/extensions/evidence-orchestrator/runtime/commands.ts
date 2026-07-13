import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ensureProjectDirs, missingPaths } from '../evidence/artifact-index';
import { answerClarification } from '../requirements/clarifications';
import {
  answerGate,
  isGateAnswered,
  resolvePendingGate,
} from '../workflow/gates';
import {
  checkIssueSourceDrift,
  startIterationFromIssue,
  syncIssueSource,
} from '../requirements/github-issue';
import {
  artifactRelativePath,
  iterationRoot,
} from '../workflow/iteration-paths';
import { PHASE_META, PHASE_ORDER } from '../workflow/phase-catalog';
import { runPhaseSubagent } from '../subagents/phase-runner';
import { buildPhaseTask } from '../subagents/phase-task';
import { readState, selectWorkItem, writeState } from '../workflow/state-store';
import type { Phase } from '../workflow/types';
import { STATUS_KEY, SUBAGENT_MESSAGE_TYPE, statusLabel } from './identity';
import { selectOrCreateGitHubIssue } from './issue-picker';
import { statusMarkdown } from './status';

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
      'Run the current Evidence Orchestrator phase; coding accepts --story=US-xxx --scenario=SC-xxx',
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      let state = readState(ctx.cwd);
      ensureProjectDirs(ctx.cwd, iterationRoot(ctx.cwd, state));
      if (state.pending_gate && isGateAnswered(ctx.cwd, state.pending_gate)) {
        state = resolvePendingGate(ctx.cwd);
      }
      if (state.halted) {
        ctx.ui.notify(
          `Iteration ${state.iteration_id} is halted: ${state.halted.reason}`,
          'error',
        );
        return;
      }
      if (state.phase !== 'complete' && !state.requirement_source) {
        ctx.ui.notify(
          'This bootstrap iteration is archival and cannot run. Select a GitHub Issue with /evidence-new.',
          'error',
        );
        return;
      }
      if (state.pending_clarification) {
        const pending = state.pending_clarification;
        ctx.ui.notify(
          `Clarification ${pending.question_id} for ${pending.story_id} is awaiting a domain-expert answer: ${pending.question}. Run /evidence-answer <answer> before continuing.`,
          'info',
        );
        return;
      }
      if (parsed.phase && parsed.phase !== state.phase) {
        ctx.ui.notify(
          `Cannot run ${parsed.phase}: current phase is ${state.phase}. Use /evidence-new before a new iteration.`,
          'error',
        );
        return;
      }
      if (parsed.storyId || parsed.scenarioId) {
        if (state.phase !== 'coding') {
          ctx.ui.notify(
            'A --story/--scenario work item can only be selected during coding.',
            'error',
          );
          return;
        }
        if (!parsed.storyId || !parsed.scenarioId) {
          ctx.ui.notify(
            'Coding requires both --story=US-xxx and --scenario=SC-xxx.',
            'error',
          );
          return;
        }
        try {
          selectWorkItem(ctx.cwd, parsed.storyId, parsed.scenarioId);
        } catch (error) {
          ctx.ui.notify(
            error instanceof Error ? error.message : String(error),
            'error',
          );
          return;
        }
      }
      const current = readState(ctx.cwd);
      if (
        current.pending_gate &&
        !isGateAnswered(ctx.cwd, current.pending_gate)
      ) {
        ctx.ui.notify(
          `Gate ${current.pending_gate} is pending. Edit ${artifactRelativePath(current, `artifacts/gates/${current.pending_gate}.md`)} or run /evidence-gate <decision>.`,
          'info',
        );
        return;
      }
      if (current.phase !== 'complete') {
        const missingInputs = missingPaths(
          ctx.cwd,
          PHASE_META[current.phase].inputs.map((path) =>
            artifactRelativePath(current, path),
          ),
        );
        if (missingInputs.length > 0) {
          ctx.ui.notify(
            `Cannot run ${current.phase}: missing inputs: ${missingInputs.join(', ')}.`,
            'error',
          );
          return;
        }
      }
      let task: string;
      try {
        task = buildPhaseTask(ctx.cwd, parsed.phase, parsed.rest);
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
        return;
      }
      if (parsed.dryRun || current.phase === 'complete')
        return ctx.ui.notify(task, 'info');

      const updated = writeState(ctx.cwd, {
        ...current,
        pi: {
          enabled: true,
          version: 4,
          ...(current.pi ?? {}),
          last_command: `/evidence-run ${args}`.trim(),
          last_run_at: new Date().toISOString(),
        },
      });
      ctx.ui.setStatus(STATUS_KEY, statusLabel(updated, 'subagent'));

      try {
        const result = await runPhaseSubagent({
          cwd: ctx.cwd,
          phase: current.phase,
          task,
        });
        pi.sendMessage({
          customType: SUBAGENT_MESSAGE_TYPE,
          content: result.output,
          display: true,
          details: result,
        });
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      } finally {
        const latest = readState(ctx.cwd);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(latest));
      }
    },
  });
}
