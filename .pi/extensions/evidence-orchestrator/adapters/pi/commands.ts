import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { WorkflowState } from '../../iteration/state';
import { readPersistedState } from '../../iteration/state-repository';
import { confirmModelingProfile } from '../../loops/understand/modeling/profile';
import { decideModel } from '../../loops/understand/modeling/model-decision';
import { decideKickoff } from '../../loops/kickoff/story-decision';
import { decideKnowledgeResponse } from '../../loops/respond/response-cycle';
import { decideUnderstanding } from '../../loops/understand/scenario/candidates';
import { decideTasking } from '../../loops/tasking/desk-check';
import {
  decideShowcase,
  recordShowcaseEvaluation,
  recordShowcaseProductObservation,
  recordShowcaseRisk,
  showcaseNextInstruction,
  showcaseRequiresHumanAction,
} from '../../loops/showcase/showcase-session';
import {
  navigatePair,
  pairNextInstruction,
  reviewPairRed,
} from '../../loops/pair/pair-session';
import {
  checkIssueSourceDriftAsync,
  startIterationFromIssueAsync,
  syncIssueSourceAsync,
} from '../../capabilities/issue-source/github-issue-source';
import { decideDeliveryIncrement } from '../../capabilities/delivery-plan/completion';
import { STATUS_KEY, statusLabel } from './identity';
import {
  isCompletedIteration,
  ActivityRunBlockedError,
  prepareActivityRun,
} from './activity/dispatch';
import { createGitHubCliRunner } from '../github/pi-cli';
import { selectOrCreateGitHubIssue } from './issue-picker';
import { runWithLoader } from './loading';
import { statusMarkdown } from './status';
import {
  parseDeskCheckDecision,
  parseKickoffDecision,
  parseModelDecision,
  parseModelingProfileDecision,
  parsePairDecision,
  parseRespondDecision,
  parseScenarioDecision,
  parseShowcaseDecision,
  promptDeskCheckDecision,
  promptKickoffDecision,
  promptModelDecision,
  promptModelingProfileDecision,
  promptPairDecision,
  promptRespondDecision,
  promptScenarioDecision,
  promptShowcaseDecision,
  waitForIdle,
} from './command-inputs';
import { parseArgs, runPreparedActivityFromCommand } from './activity-command';

export {
  parseModelDecision,
  parseRespondDecision,
  parseShowcaseDecision,
} from './command-inputs';

export function activeStageCommand(
  cwd: string,
  state: WorkflowState | undefined = readPersistedState(cwd),
): string | undefined {
  if (!state || state.halted || state.loop === 'complete') return undefined;

  if (state.loop === 'kickoff') {
    return state.kickoff_candidate ? 'evidence-kickoff' : 'evidence-run';
  }
  if (state.loop === 'understand') {
    if (state.understand_stage === 'scenario_review') {
      return 'evidence-scenario';
    }
    if (state.modeling_stage === 'profile_review') {
      return 'evidence-modeling-profile';
    }
    if (state.modeling_stage === 'model_review') return 'evidence-model';
    return 'evidence-run';
  }
  if (state.loop === 'tasking') {
    return state.tasking_stage === 'desk_check'
      ? 'evidence-desk-check'
      : 'evidence-run';
  }
  if (state.loop === 'pair') {
    return state.pair_session?.checkpoint === 'red_observed' ||
      state.pair_session?.checkpoint === 'quality_gate_failed'
      ? 'evidence-pair'
      : 'evidence-run';
  }
  if (state.loop === 'showcase') {
    return showcaseRequiresHumanAction(cwd)
      ? 'evidence-showcase'
      : 'evidence-run';
  }
  if (state.loop === 'respond') {
    return state.respond_stage === 'decision'
      ? 'evidence-respond'
      : 'evidence-run';
  }
  return undefined;
}

export function registerCommands(pi: ExtensionAPI): void {
  type CommandOptions = Parameters<ExtensionAPI['registerCommand']>[1];
  const registerStageCommand = (name: string, options: CommandOptions) => {
    pi.registerCommand(name, options);
  };

  pi.registerCommand('evidence-status', {
    description:
      'Show Evidence Orchestrator loop, decisions, evidence, and code status',
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
          `Evidence Orchestrator started ${state.iteration_id} from ${state.requirement_source?.repository}#${state.requirement_source?.issue_number}. The Issue is frozen; run /evidence-run to prepare one Kickoff candidate, then /evidence-kickoff for the human decision.`,
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

  registerStageCommand('evidence-kickoff', {
    description:
      'Human-only decision for the pending Kickoff candidate: confirm, revise, split, defer, or stop',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseKickoffDecision(args) ?? (await promptKickoffDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Kickoff decision cancelled; the candidate is unchanged.',
            'info',
          );
          return;
        }
        const state = decideKickoff(ctx.cwd, decision.action, decision.reason);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        if (decision.action === 'confirmed') {
          ctx.ui.notify(
            `Human confirmed ${state.active_clarification_story?.story_id}; Kickoff is complete and Understand is ready.`,
            'info',
          );
        } else if (decision.action === 'revise') {
          ctx.ui.notify(
            'Human requested a revised Kickoff candidate. Run /evidence-run with the feedback before continuing.',
            'info',
          );
        } else {
          ctx.ui.notify(
            `Human chose ${decision.action}; this iteration is halted with the decision preserved.`,
            'info',
          );
        }
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  registerStageCommand('evidence-scenario', {
    description:
      'Human-only Scenario decision: confirm one draft, continue TQA, split, or defer',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseScenarioDecision(args) ?? (await promptScenarioDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Scenario decision cancelled; Understand is unchanged.',
            'info',
          );
          return;
        }
        const state = decideUnderstanding(ctx.cwd, decision);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        if (decision.action === 'confirmed') {
          ctx.ui.notify(
            `Human confirmed ${state.confirmed_scenario?.story_id} / ${state.confirmed_scenario?.scenario_id}; model validation is next.`,
            'info',
          );
        } else if (decision.action === 'continue') {
          ctx.ui.notify(
            'Human requested more business understanding; TQA is ready to resume.',
            'info',
          );
        } else {
          ctx.ui.notify(
            `Human chose ${decision.action}; the active Story is halted and the delivery-iteration evidence is preserved.`,
            'info',
          );
        }
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  registerStageCommand('evidence-modeling-profile', {
    description:
      'Human-only modeling Profile confirmation or override for the confirmed Scenario',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseModelingProfileDecision(args) ??
          (await promptModelingProfileDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Modeling Profile decision cancelled; the proposal is unchanged.',
            'info',
          );
          return;
        }
        const state = confirmModelingProfile(ctx.cwd, decision);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          `Human confirmed modeling Profile ${state.modeling_profile?.subject}/${state.modeling_profile?.method} with model_change_required=${state.modeling_profile?.model_change_required}. Run /evidence-run to expand the Scenario through this model.`,
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

  registerStageCommand('evidence-model', {
    description:
      'Human-only decision for the challenged model and ubiquitous language',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseModelDecision(args) ?? (await promptModelDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Model decision cancelled; state is unchanged.',
            'info',
          );
          return;
        }
        const state = decideModel(ctx.cwd, decision.action, decision.reason);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          decision.action === 'confirm'
            ? `Human confirmed the model and ubiquitous language; Tasking is ready for ${state.confirmed_scenario?.story_id} / ${state.confirmed_scenario?.scenario_id}.`
            : `Human recorded ${decision.action}; workflow returned to ${state.understand_stage}/${state.modeling_stage ?? 'tqa'}.`,
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

  registerStageCommand('evidence-desk-check', {
    description:
      'Human-only Tasking decision: approve, revise, architecture_gap, process_gap, or scenario_gap',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseDeskCheckDecision(args) ?? (await promptDeskCheckDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Desk Check cancelled; the Tasking draft is unchanged.',
            'info',
          );
          return;
        }
        const state = decideTasking(ctx.cwd, decision.action, decision.reason);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        if (decision.action === 'approve') {
          ctx.ui.notify(
            `Human approved ${state.approved_test_plan_path}; Pair is ready for Story ${state.active_work_item?.story_id} / [${state.active_work_item?.scenario_ids.join(', ')}].`,
            'info',
          );
        } else if (decision.action === 'scenario_gap') {
          ctx.ui.notify(
            'Desk Check routed the Scenario gap to Understand TQA.',
            'info',
          );
        } else {
          ctx.ui.notify(
            `Desk Check recorded ${decision.action}; run /evidence-run to revise Tasking knowledge and regenerate the plan.`,
            'info',
          );
        }
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  registerStageCommand('evidence-pair', {
    description:
      'Human Navigator decision for Red acceptance or a return to test, implementation, Tasking, or quality-gate retry',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parsePairDecision(args) ?? (await promptPairDecision(ctx));
        if (!decision) {
          ctx.ui.notify('Pair decision cancelled; state is unchanged.', 'info');
          return;
        }
        const state =
          decision.kind === 'red'
            ? reviewPairRed(ctx.cwd, decision.failureKind, decision.reason)
            : decision.kind === 'delivery'
              ? decideDeliveryIncrement(
                  ctx.cwd,
                  decision.action,
                  decision.reason,
                )
              : navigatePair(ctx.cwd, decision.action, decision.reason);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          `Pair decision recorded. ${pairNextInstruction(state)}.`,
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

  registerStageCommand('evidence-showcase', {
    description:
      'Human-only Showcase risk and accept/revise/reject decisions with semantic feedback routing',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseShowcaseDecision(args) ?? (await promptShowcaseDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Showcase decision cancelled; state is unchanged.',
            'info',
          );
          return;
        }
        const state =
          decision.kind === 'risk'
            ? recordShowcaseRisk(
                ctx.cwd,
                decision.quadrant,
                decision.disposition,
                decision.activities,
                decision.reason,
              )
            : decision.kind === 'observation'
              ? recordShowcaseProductObservation(ctx.cwd, decision)
              : decision.kind === 'evaluation'
                ? recordShowcaseEvaluation(ctx.cwd, decision)
                : decideShowcase(
                    ctx.cwd,
                    decision.action,
                    decision.reason,
                    decision.target,
                  );
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          decision.kind === 'risk'
            ? `Recorded ${decision.quadrant}=${decision.disposition}. ${showcaseNextInstruction(ctx.cwd)}.`
            : decision.kind === 'observation'
              ? `Recorded human product/value observation. ${showcaseNextInstruction(ctx.cwd)}.`
              : decision.kind === 'evaluation'
                ? `Recorded ${decision.quadrant}/${decision.activity}=${decision.outcome}. ${showcaseNextInstruction(ctx.cwd)}.`
                : decision.action === 'reject'
                  ? 'Human rejected the Showcase; this iteration is halted with facts and feedback preserved.'
                  : `Human recorded Showcase ${decision.action}; workflow loop=${state.loop}.`,
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

  registerStageCommand('evidence-respond', {
    description:
      'Human-only Respond approval or revision for validated knowledge and the next Probe',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseRespondDecision(args) ?? (await promptRespondDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Respond decision cancelled; state is unchanged.',
            'info',
          );
          return;
        }
        const state = decideKnowledgeResponse(
          ctx.cwd,
          decision.action,
          decision.reason,
        );
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          decision.action === 'approve'
            ? `Human approved the knowledge response. ${state.iteration_id} is complete; update the GitHub Issue explicitly before starting the next snapshot.`
            : 'Human requested a revised knowledge response; run /evidence-run to resume Respond.',
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
      'Refresh the active GitHub Issue snapshot while still in Kickoff',
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
            ? `Issue changed after snapshot: ${drift.snapshot_hash} → ${drift.remote_hash}. Refresh in Kickoff or start a new iteration.`
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

  registerStageCommand('evidence-run', {
    description:
      'Run the current activity; Pair advances at most one Driver or command checkpoint per invocation',
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      try {
        await waitForIdle(ctx);
        const preparation = prepareActivityRun(ctx.cwd, {
          instructions: parsed.rest,
        });
        if (parsed.dryRun || isCompletedIteration(preparation)) {
          ctx.ui.notify(preparation.task, 'info');
          return;
        }

        await runPreparedActivityFromCommand(
          pi,
          ctx,
          preparation,
          `/evidence-run ${args}`.trim(),
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          error instanceof ActivityRunBlockedError ? 'info' : 'error',
        );
      }
    },
  });
}
