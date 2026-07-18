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
} from '../../loops/pair/pair-session';
import { startIterationFromCandidate } from '../../capabilities/inbox/iteration-intake';
import { decideDeliveryIncrement } from '../../loops/pair/coding-approval';
import { STATUS_KEY, statusLabel } from './identity';
import {
  isCompletedIteration,
  ActivityRunBlockedError,
  prepareActivityRun,
} from './activity/dispatch';
import {
  requireCandidateId,
  selectReadyInboxCandidate,
} from './candidate-picker';
import {
  runInboxSourceExtractionFlow,
  type InboxAgentRunner,
} from './inbox-commands';
import { statusCommandMarkdown } from './status';
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
import {
  parseArgs,
  runHtmlChangeExplanationFromCommand,
  runPreparedActivityFromCommand,
} from './activity-command';
import { EVIDENCE_COMMANDS } from './command-names';

export {
  parseModelDecision,
  parseRespondDecision,
  parseShowcaseDecision,
} from './command-inputs';
export {
  sanitizeDecisionText,
  validateDecisionPacket,
  type HumanDecisionPacket,
} from './decision-packets/contract';

export function activeStageCommand(
  cwd: string,
  state: WorkflowState | undefined = readPersistedState(cwd),
): string | undefined {
  if (!state || state.halted || state.loop === 'complete') return undefined;

  if (state.loop === 'kickoff') {
    return state.kickoff_candidate
      ? EVIDENCE_COMMANDS.kickoff
      : EVIDENCE_COMMANDS.run;
  }
  if (state.loop === 'understand') {
    if (state.understand_stage === 'scenario_review') {
      return EVIDENCE_COMMANDS.scenario;
    }
    if (state.modeling_stage === 'profile_review') {
      return EVIDENCE_COMMANDS.modelingProfile;
    }
    if (state.modeling_stage === 'model_review') {
      return EVIDENCE_COMMANDS.model;
    }
    return EVIDENCE_COMMANDS.run;
  }
  if (state.loop === 'tasking') {
    return state.tasking_stage === 'desk_check'
      ? EVIDENCE_COMMANDS.deskCheck
      : EVIDENCE_COMMANDS.run;
  }
  if (state.loop === 'pair') {
    return state.pair_session?.checkpoint === 'quality_gates_passed' ||
      state.pair_session?.automation_exception
      ? EVIDENCE_COMMANDS.pair
      : EVIDENCE_COMMANDS.run;
  }
  if (state.loop === 'showcase') {
    return showcaseRequiresHumanAction(cwd)
      ? EVIDENCE_COMMANDS.showcase
      : EVIDENCE_COMMANDS.run;
  }
  if (state.loop === 'respond') {
    return state.respond_stage === 'decision'
      ? EVIDENCE_COMMANDS.respond
      : EVIDENCE_COMMANDS.run;
  }
  return undefined;
}

export function registerCommands(
  pi: ExtensionAPI,
  runInboxAgent?: InboxAgentRunner,
): void {
  type CommandOptions = Parameters<ExtensionAPI['registerCommand']>[1];
  const registerStageCommand = (name: string, options: CommandOptions) => {
    pi.registerCommand(name, options);
  };

  pi.registerCommand(EVIDENCE_COMMANDS.status, {
    description:
      'Show a bounded Evidence summary, or a paginated artifact/code-file detail view',
    handler: async (args, ctx) => {
      try {
        ctx.ui.notify(statusCommandMarkdown(ctx.cwd, args), 'info');
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand(EVIDENCE_COMMANDS.newIteration, {
    description:
      'Extract Story candidates from a selected Inbox source, then start a new iteration',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        let candidateId: string | undefined;
        if (args.trim()) {
          candidateId = requireCandidateId(args);
        } else {
          const extracted = await runInboxSourceExtractionFlow(
            pi,
            ctx,
            runInboxAgent,
          );
          if (extracted) candidateId = await selectReadyInboxCandidate(ctx);
        }
        if (!candidateId) {
          ctx.ui.notify('New iteration cancelled.', 'info');
          return;
        }
        const state = startIterationFromCandidate(ctx.cwd, candidateId);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          `Evidence Orchestrator started ${state.iteration_id} from ${candidateId}. The Inbox Intake is frozen; run /evidence-kickoff for the human Story decision.`,
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

  registerStageCommand(EVIDENCE_COMMANDS.kickoff, {
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

  registerStageCommand(EVIDENCE_COMMANDS.scenario, {
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
            `Human confirmed ${state.confirmed_scenarios?.[0]?.story_id} / [${state.confirmed_scenarios?.map(({ scenario_id }) => scenario_id).join(', ')}]; model validation is next.`,
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

  registerStageCommand(EVIDENCE_COMMANDS.modelingProfile, {
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
        const noModelImpact = state.modeling_profile?.method === 'none';
        ctx.ui.notify(
          noModelImpact
            ? `Human confirmed modeling Profile ${state.modeling_profile?.subject}/none with model_change_required=false. No canonical model expansion or challenge is required; the workflow advanced to Tasking.`
            : `Human confirmed modeling Profile ${state.modeling_profile?.subject}/${state.modeling_profile?.method} with model_change_required=${state.modeling_profile?.model_change_required}. Run /evidence-run to expand the Scenario through this model.`,
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

  registerStageCommand(EVIDENCE_COMMANDS.model, {
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
            ? `Human confirmed the model and ubiquitous language; Tasking is ready for ${state.confirmed_scenarios?.[0]?.story_id} / [${state.confirmed_scenarios?.map(({ scenario_id }) => scenario_id).join(', ')}].`
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

  registerStageCommand(EVIDENCE_COMMANDS.deskCheck, {
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

  registerStageCommand(EVIDENCE_COMMANDS.pair, {
    description:
      'One human Story-level coding approval after automated Pair, or explicit exception routing',
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
          decision.kind === 'delivery'
            ? decideDeliveryIncrement(ctx.cwd, decision.action, decision.reason)
            : navigatePair(ctx.cwd, decision.action, decision.reason);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          decision.kind === 'delivery'
            ? `Human Story coding approval recorded at ${state.pair_session?.coding_decision?.artifact_path ?? 'missing'}. Entered Showcase.`
            : `Pair exception decision recorded. ${pairNextInstruction(state)}.`,
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

  registerStageCommand(EVIDENCE_COMMANDS.explainDiff, {
    description:
      'Generate one optional self-contained HTML explanation after Pair quality gates pass',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        if (args.trim()) {
          throw new Error('Usage: /evidence-explain-diff');
        }
        await runHtmlChangeExplanationFromCommand(pi, ctx);
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  registerStageCommand(EVIDENCE_COMMANDS.showcase, {
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

  registerStageCommand(EVIDENCE_COMMANDS.respond, {
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
            ? `Human approved the knowledge response. ${state.iteration_id} is complete; capture the next Probe in the Inbox before starting another iteration.`
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

  registerStageCommand(EVIDENCE_COMMANDS.run, {
    description:
      'Run the current activity; Pair automatically completes recorded coding checkpoints until Story approval or exception',
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
