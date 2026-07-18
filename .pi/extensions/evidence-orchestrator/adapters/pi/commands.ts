import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { readState } from '../../iteration/state-repository';
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
} from '../../loops/showcase/showcase-session';
import {
  navigatePair,
  pairNextInstruction,
} from '../../loops/pair/pair-session';
import { startIterationFromCandidate } from '../../capabilities/inbox/iteration-intake';
import { decideDeliveryIncrement } from '../../loops/pair/coding-approval';
import {
  reconcileBoardItem,
  requestDeliveryAdmission,
} from '../../capabilities/flow-control/admission';
import { answerClarification } from '../../loops/understand/tqa/conversation';
import {
  isCompletedIteration,
  ActivityRunBlockedError,
  prepareActivityRun,
} from './activity/dispatch';
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
import { registerFlowCommands } from './flow-commands';
import {
  parseIterationCommand,
  requireWorkItemTarget,
} from './work-item-target';

export {
  parseModelDecision,
  parseRespondDecision,
  parseShowcaseDecision,
} from './command-inputs';

function requireCandidateId(value: string): string {
  const candidateId = value.trim().toUpperCase();
  if (!/^CAND-\d{4,}$/.test(candidateId)) {
    throw new Error('Iteration candidate must be CAND-xxxx.');
  }
  return candidateId;
}

function worktreeContext<T extends { cwd: string }>(
  context: T,
  cwd: string,
): T {
  return { ...context, cwd };
}

function reconcile(
  primaryRoot: string,
  iterationId: string,
  state: ReturnType<typeof readState>,
): void {
  reconcileBoardItem(primaryRoot, iterationId, state);
}

export function registerCommands(pi: ExtensionAPI): void {
  type CommandOptions = Parameters<ExtensionAPI['registerCommand']>[1];
  const registerStageCommand = (name: string, options: CommandOptions) => {
    pi.registerCommand(name, options);
  };

  pi.registerCommand(EVIDENCE_COMMANDS.status, {
    description:
      'Show the Story Board or one exact Iteration status and artifact page',
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
      'Claim one exact ready Inbox Candidate and provision its isolated Story worktree',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        if (!args.trim()) throw new Error('Usage: /evidence-new CAND-xxxx');
        const candidateId = requireCandidateId(args);
        const state = startIterationFromCandidate(ctx.cwd, candidateId);
        ctx.ui.notify(
          `Evidence Orchestrator started ${state.iteration_id} from ${candidateId}. Run /evidence-kickoff ${state.iteration_id} for the human Story decision.`,
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

  registerStageCommand(EVIDENCE_COMMANDS.answer, {
    description:
      'Record one explicit domain-expert answer for an exact Iteration and pending TQA question',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        const separator = parsed.rest.search(/\s/);
        const questionId = (
          separator < 0 ? parsed.rest : parsed.rest.slice(0, separator)
        ).toUpperCase();
        const answer = separator < 0 ? '' : parsed.rest.slice(separator).trim();
        if (!/^Q-\d{3,}$/.test(questionId) || !answer) {
          throw new Error('Usage: /evidence-answer ITER-xxxx Q-xxx <answer>');
        }
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        if (target.state.pending_clarification?.question_id !== questionId) {
          throw new Error(
            `${parsed.iterationId} does not await ${questionId}.`,
          );
        }
        const state = answerClarification(target.worktreeRoot, answer);
        reconcile(target.primaryRoot, parsed.iterationId, state);
        ctx.ui.notify(
          `${parsed.iterationId}/${questionId} answered. Run /evidence-run ${parsed.iterationId} to continue its persistent TQA session.`,
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
      'Human-only decision for one exact Iteration Kickoff candidate',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        const targetCtx = worktreeContext(ctx, target.worktreeRoot);
        const decision =
          parseKickoffDecision(parsed.rest) ??
          (await promptKickoffDecision(targetCtx));
        if (!decision) {
          ctx.ui.notify(
            'Kickoff decision cancelled; the candidate is unchanged.',
            'info',
          );
          return;
        }
        const state = decideKickoff(
          target.worktreeRoot,
          decision.action,
          decision.reason,
        );
        reconcile(target.primaryRoot, parsed.iterationId, state);
        if (decision.action === 'confirmed') {
          ctx.ui.notify(
            `Human confirmed ${parsed.iterationId}/${state.active_clarification_story?.story_id}; Understand is ready.`,
            'info',
          );
        } else if (decision.action === 'revise') {
          ctx.ui.notify(
            `Human requested a revised Kickoff candidate for ${parsed.iterationId}.`,
            'info',
          );
        } else {
          ctx.ui.notify(
            `Human chose ${decision.action}; ${parsed.iterationId} is terminal with evidence preserved.`,
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
    description: 'Human-only Scenario decision for one exact Iteration',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        const targetCtx = worktreeContext(ctx, target.worktreeRoot);
        const decision =
          parseScenarioDecision(parsed.rest) ??
          (await promptScenarioDecision(targetCtx));
        if (!decision) {
          ctx.ui.notify(
            'Scenario decision cancelled; Understand is unchanged.',
            'info',
          );
          return;
        }
        const state = decideUnderstanding(target.worktreeRoot, decision);
        reconcile(target.primaryRoot, parsed.iterationId, state);
        if (decision.action === 'confirmed') {
          ctx.ui.notify(
            `Human confirmed ${parsed.iterationId}/${state.confirmed_scenarios?.[0]?.story_id} / [${state.confirmed_scenarios?.map(({ scenario_id }) => scenario_id).join(', ')}].`,
            'info',
          );
        } else if (decision.action === 'continue') {
          ctx.ui.notify(
            `${parsed.iterationId} returned to TQA for more business understanding.`,
            'info',
          );
        } else {
          ctx.ui.notify(
            `Human chose ${decision.action}; ${parsed.iterationId} is terminal.`,
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
    description: 'Human-only modeling Profile decision for one exact Iteration',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        const targetCtx = worktreeContext(ctx, target.worktreeRoot);
        const decision =
          parseModelingProfileDecision(parsed.rest) ??
          (await promptModelingProfileDecision(targetCtx));
        if (!decision) {
          ctx.ui.notify(
            'Modeling Profile decision cancelled; the proposal is unchanged.',
            'info',
          );
          return;
        }
        const state = confirmModelingProfile(target.worktreeRoot, decision);
        reconcile(target.primaryRoot, parsed.iterationId, state);
        const noModelImpact = state.modeling_profile?.method === 'none';
        ctx.ui.notify(
          noModelImpact
            ? `${parsed.iterationId} confirmed no model impact and requested Planning admission.`
            : `${parsed.iterationId} confirmed modeling Profile ${state.modeling_profile?.subject}/${state.modeling_profile?.method}.`,
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
    description: 'Human-only challenged model decision for one exact Iteration',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        const targetCtx = worktreeContext(ctx, target.worktreeRoot);
        const decision =
          parseModelDecision(parsed.rest) ??
          (await promptModelDecision(targetCtx));
        if (!decision) {
          ctx.ui.notify(
            'Model decision cancelled; state is unchanged.',
            'info',
          );
          return;
        }
        const state = decideModel(
          target.worktreeRoot,
          decision.action,
          decision.reason,
        );
        reconcile(target.primaryRoot, parsed.iterationId, state);
        ctx.ui.notify(
          decision.action === 'confirm'
            ? `${parsed.iterationId} model confirmed; Planning admission requested.`
            : `${parsed.iterationId} recorded ${decision.action} and routed feedback to ${state.understand_stage}/${state.modeling_stage ?? 'tqa'}.`,
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
    description: 'Human-only Tasking decision for one exact Iteration',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        const targetCtx = worktreeContext(ctx, target.worktreeRoot);
        const decision =
          parseDeskCheckDecision(parsed.rest) ??
          (await promptDeskCheckDecision(targetCtx));
        if (!decision) {
          ctx.ui.notify(
            'Desk Check cancelled; the Tasking draft is unchanged.',
            'info',
          );
          return;
        }
        const state = decideTasking(
          target.worktreeRoot,
          decision.action,
          decision.reason,
        );
        reconcile(target.primaryRoot, parsed.iterationId, state);
        if (decision.action === 'approve') {
          ctx.ui.notify(
            `${parsed.iterationId} Desk Check approved; Ready admission requested.`,
            'info',
          );
        } else if (decision.action === 'scenario_gap') {
          ctx.ui.notify(
            `${parsed.iterationId} routed its Scenario gap to Understand.`,
            'info',
          );
        } else {
          ctx.ui.notify(
            `${parsed.iterationId} recorded ${decision.action}.`,
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
      'Human Story-level coding approval or exception routing for one exact Iteration',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        const targetCtx = worktreeContext(ctx, target.worktreeRoot);
        const decision =
          parsePairDecision(parsed.rest) ??
          (await promptPairDecision(targetCtx));
        if (!decision) {
          ctx.ui.notify('Pair decision cancelled; state is unchanged.', 'info');
          return;
        }
        const state =
          decision.kind === 'delivery'
            ? decideDeliveryIncrement(
                target.worktreeRoot,
                decision.action,
                decision.reason,
              )
            : navigatePair(
                target.worktreeRoot,
                decision.action,
                decision.reason,
              );
        reconcile(target.primaryRoot, parsed.iterationId, state);
        ctx.ui.notify(
          decision.kind === 'delivery'
            ? `${parsed.iterationId} Story coding approval recorded; Review admission requested.`
            : `${parsed.iterationId} Pair exception routed. ${pairNextInstruction(state)}.`,
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
      'Generate one optional HTML explanation for one exact Iteration',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        if (parsed.rest) {
          throw new Error('Usage: /evidence-explain-diff ITER-xxxx');
        }
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        await runHtmlChangeExplanationFromCommand(
          pi,
          worktreeContext(ctx, target.worktreeRoot),
        );
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
      'Human-only Showcase observation and decision for one exact Iteration',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        const targetCtx = worktreeContext(ctx, target.worktreeRoot);
        const decision =
          parseShowcaseDecision(parsed.rest) ??
          (await promptShowcaseDecision(targetCtx));
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
                target.worktreeRoot,
                decision.quadrant,
                decision.disposition,
                decision.activities,
                decision.reason,
              )
            : decision.kind === 'observation'
              ? recordShowcaseProductObservation(target.worktreeRoot, decision)
              : decision.kind === 'evaluation'
                ? recordShowcaseEvaluation(target.worktreeRoot, decision)
                : decideShowcase(
                    target.worktreeRoot,
                    decision.action,
                    decision.reason,
                    decision.target,
                  );
        reconcile(target.primaryRoot, parsed.iterationId, state);
        ctx.ui.notify(
          decision.kind === 'risk'
            ? `${parsed.iterationId} recorded ${decision.quadrant}=${decision.disposition}. ${showcaseNextInstruction(target.worktreeRoot)}.`
            : decision.kind === 'observation'
              ? `${parsed.iterationId} recorded product/value observation.`
              : decision.kind === 'evaluation'
                ? `${parsed.iterationId} recorded ${decision.quadrant}/${decision.activity}=${decision.outcome}.`
                : `${parsed.iterationId} recorded Showcase ${decision.action}; loop=${state.loop}.`,
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
      'Human-only Respond approval or revision for one exact Iteration',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const parsed = parseIterationCommand(args);
        const target = requireWorkItemTarget(ctx.cwd, parsed.iterationId);
        const targetCtx = worktreeContext(ctx, target.worktreeRoot);
        const decision =
          parseRespondDecision(parsed.rest) ??
          (await promptRespondDecision(targetCtx));
        if (!decision) {
          ctx.ui.notify(
            'Respond decision cancelled; state is unchanged.',
            'info',
          );
          return;
        }
        const state = decideKnowledgeResponse(
          target.worktreeRoot,
          decision.action,
          decision.reason,
        );
        reconcile(target.primaryRoot, parsed.iterationId, state);
        ctx.ui.notify(
          decision.action === 'approve'
            ? `${parsed.iterationId} knowledge response approved; Story flow is complete.`
            : `${parsed.iterationId} knowledge response requires revision.`,
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
      'Run one exact Iteration activity; Pair remains controller-automated within that Story',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const iteration = parseIterationCommand(args);
        let target = requireWorkItemTarget(ctx.cwd, iteration.iterationId);
        if (
          target.state.loop === 'pair' &&
          target.state.pair_session?.checkpoint === 'plan_confirmed' &&
          target.item.admitted_lane === 'ready'
        ) {
          const admission = requestDeliveryAdmission(
            target.primaryRoot,
            iteration.iterationId,
            target.state,
          );
          if (admission.kind === 'queued') {
            throw new ActivityRunBlockedError(
              'flow_admission',
              `${iteration.iterationId} is queued for Delivery WIP.`,
            );
          }
          target = requireWorkItemTarget(ctx.cwd, iteration.iterationId);
        }
        const parsed = parseArgs(iteration.rest);
        const targetCtx = worktreeContext(ctx, target.worktreeRoot);
        const preparation = prepareActivityRun(target.worktreeRoot, {
          instructions: parsed.rest,
        });
        if (parsed.dryRun || isCompletedIteration(preparation)) {
          ctx.ui.notify(preparation.task, 'info');
          return;
        }
        await runPreparedActivityFromCommand(
          pi,
          targetCtx,
          preparation,
          `/evidence-run ${iteration.iterationId} ${iteration.rest}`.trim(),
        );
        reconcile(
          target.primaryRoot,
          iteration.iterationId,
          readState(target.worktreeRoot),
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          error instanceof ActivityRunBlockedError ? 'info' : 'error',
        );
      }
    },
  });

  registerFlowCommands(pi);
}
