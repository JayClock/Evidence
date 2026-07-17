import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { WorkflowState } from '../../iteration/state';
import { startIterationFromCandidate } from '../../capabilities/inbox/iteration-intake';
import { proposeInboxStoryCandidates } from '../../capabilities/inbox/story-candidate';
import {
  collectArtifacts,
  collectCodeFiles,
} from '../../iteration/artifact-inventory';
import { iterationRoot } from '../../iteration/artifact-layout';
import { proposeKnowledgeResponse } from '../../loops/respond/response-cycle';
import { recordModelChallenge } from '../../loops/understand/modeling/challenge';
import { recordModelAnalysis } from '../../loops/understand/modeling/candidate-model';
import { proposeModelingProfile } from '../../loops/understand/modeling/profile';
import {
  answerClarification,
  askClarification,
} from '../../loops/understand/tqa/conversation';
import { proposeKickoffCandidate } from '../../loops/kickoff/story-candidate';
import { proposeScenarioDrafts } from '../../loops/understand/scenario/candidates';
import {
  isActivityAgentFailureDetails,
  renderActivityAgentCall,
  renderActivityAgentResult,
} from './activity/activity-agent-renderer';
import {
  readPersistedState,
  readState,
} from '../../iteration/state-repository';
import { statusMarkdown } from './status';
import { proposeTaskingDraft } from '../../loops/tasking/tasking-draft';
import { recordShowcaseReview } from '../../loops/showcase/showcase-session';
import { isCompletedIteration, prepareActivityRun } from './activity/dispatch';
import { executePreparedActivityRun } from './activity/execution';

import {
  activityRunParam,
  clarificationAnswerParam,
  clarificationQuestionParam,
  candidateSourceParam,
  inboxStoryCandidatesParam,
  kickoffCandidateParam,
  modelAnalysisParam,
  modelChallengeParam,
  modelingProfileParam,
  respondProposalParam,
  scenarioDraftParam,
  showcaseReviewParam,
  statusParam,
  taskingDraftParam,
} from './tool-schemas';

export const ORCHESTRATOR_TOOL_NAMES = [
  'evidence_orchestrator_propose_inbox_stories',
  'evidence_orchestrator_start_from_candidate',
  'evidence_orchestrator_status',
  'evidence_orchestrator_propose_kickoff',
  'evidence_orchestrator_run_activity',
  'evidence_orchestrator_propose_scenarios',
  'evidence_orchestrator_propose_modeling_profile',
  'evidence_orchestrator_record_model_analysis',
  'evidence_orchestrator_record_model_challenge',
  'evidence_orchestrator_propose_tasking',
  'evidence_orchestrator_record_showcase_review',
  'evidence_orchestrator_propose_response',
  'evidence_orchestrator_ask_question',
  'evidence_orchestrator_answer_question',
] as const;

export function toolsForState(state: WorkflowState | undefined): string[] {
  const inbox = 'evidence_orchestrator_propose_inbox_stories';
  const status = 'evidence_orchestrator_status';
  const start = 'evidence_orchestrator_start_from_candidate';
  if (!state) return [inbox, start, status];
  if (state.halted || state.loop === 'complete') return [inbox, start, status];

  const common = [inbox, start, status, 'evidence_orchestrator_run_activity'];
  if (state.loop === 'kickoff') {
    return [...common, 'evidence_orchestrator_propose_kickoff'];
  }
  if (state.loop === 'understand') {
    if (state.understand_stage === 'tqa') {
      return [
        ...common,
        'evidence_orchestrator_ask_question',
        'evidence_orchestrator_answer_question',
        'evidence_orchestrator_propose_scenarios',
      ];
    }
    if (state.modeling_stage === 'profile') {
      return [...common, 'evidence_orchestrator_propose_modeling_profile'];
    }
    if (
      state.modeling_stage === 'expansion' &&
      state.modeling_profile?.method !== 'none'
    ) {
      return [...common, 'evidence_orchestrator_record_model_analysis'];
    }
    if (state.modeling_stage === 'candidate_ready') {
      return [...common, 'evidence_orchestrator_record_model_challenge'];
    }
    return common;
  }
  if (state.loop === 'tasking') {
    return [...common, 'evidence_orchestrator_propose_tasking'];
  }
  if (state.loop === 'showcase') {
    return [...common, 'evidence_orchestrator_record_showcase_review'];
  }
  if (state.loop === 'respond') {
    return [...common, 'evidence_orchestrator_propose_response'];
  }
  return common;
}

export function syncActiveTools(
  pi: ExtensionAPI,
  state: WorkflowState | undefined,
): void {
  const owned = new Set<string>(ORCHESTRATOR_TOOL_NAMES);
  const preserved = pi.getActiveTools().filter((name) => !owned.has(name));
  pi.setActiveTools([...new Set([...preserved, ...toolsForState(state)])]);
}

export function registerTools(pi: ExtensionAPI): void {
  pi.on('tool_result', (event) => {
    if (
      (event.toolName === 'evidence_orchestrator_run_activity' ||
        event.toolName === 'evidence_orchestrator_answer_question') &&
      isActivityAgentFailureDetails(event.details)
    ) {
      return { isError: true };
    }
    return undefined;
  });

  pi.registerTool({
    name: 'evidence_orchestrator_propose_inbox_stories',
    label: 'Propose Evidence Inbox Stories',
    description:
      'Persist one to five cited Story candidates from selected Inbox source revisions',
    promptSnippet:
      'Propose source-cited Story candidates during an explicit Inbox extraction',
    promptGuidelines: [
      'Use evidence_orchestrator_propose_inbox_stories only for an explicit /evidence-inbox extract activity.',
      'Cite every selected Inbox source by its exact revision hash; do not assign US-xxx or start an iteration.',
      'After calling evidence_orchestrator_propose_inbox_stories once, stop. The candidates have no human authority.',
    ],
    parameters: inboxStoryCandidatesParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const candidates = proposeInboxStoryCandidates(
        ctx.cwd,
        params.sourceIds,
        params.candidates.map((candidate) => ({
          title: candidate.title,
          problem: candidate.problem,
          role: candidate.role,
          goal: candidate.goal,
          value: candidate.value,
          cognitiveMode: candidate.cognitiveMode,
          citations: candidate.citations,
        })),
      );
      return {
        content: [
          {
            type: 'text',
            text: `Recorded Inbox Story candidates: ${candidates
              .map(({ candidate_id }) => candidate_id)
              .join(', ')}. Stop now; a human must select a candidate.`,
          },
        ],
        details: { candidates },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_start_from_candidate',
    label: 'Start Evidence Orchestrator From Candidate',
    description:
      'Start a new isolated Evidence iteration from one ready Inbox Story candidate',
    promptSnippet:
      'Freeze a human-selected Inbox Story candidate as a new iteration Intake',
    promptGuidelines: [
      'Use evidence_orchestrator_start_from_candidate only when the user explicitly identifies the CAND-xxxx candidate.',
      'Do not select, infer, confirm, or revise a candidate on behalf of the user.',
    ],
    parameters: candidateSourceParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = startIterationFromCandidate(ctx.cwd, params.candidateId);
      return {
        content: [
          {
            type: 'text',
            text: `Started ${state.iteration_id} from ${state.intake_snapshot?.candidate_id}. The frozen candidate awaits a human /evidence-kickoff decision.`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_status',
    label: 'Evidence Orchestrator Status',
    description:
      'Read Evidence Orchestrator loop state, decisions, artifacts, and code files',
    promptSnippet: 'Inspect the current Evidence Orchestrator pipeline status',
    promptGuidelines: [
      'Use evidence_orchestrator_status when the user asks what the Evidence Orchestrator pipeline is doing or what remains.',
    ],
    parameters: statusParam,
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const state = readPersistedState(ctx.cwd);
      return {
        content: [{ type: 'text', text: statusMarkdown(ctx.cwd) }],
        details: {
          state,
          artifacts: state
            ? collectArtifacts(ctx.cwd, iterationRoot(ctx.cwd, state))
            : [],
          codeFiles: collectCodeFiles(ctx.cwd),
        },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_propose_kickoff',
    label: 'Propose Evidence Kickoff',
    description:
      'Persist one problem, actor, value, and Story candidate for a human Kickoff decision',
    promptSnippet:
      'Propose one Intake-backed replacement candidate without assigning a Story id',
    promptGuidelines: [
      'Use only in the kickoff loop after reading the frozen Inbox Intake, stable product context, and explicit revision feedback.',
      'Propose exactly one problem and one role-value Story candidate; do not generate a backlog or assign US-xxx.',
      'After calling this tool, stop. Only a human can confirm, revise, split, defer, or stop the Kickoff.',
    ],
    parameters: kickoffCandidateParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = proposeKickoffCandidate(ctx.cwd, {
        title: params.title,
        problem: params.problem,
        role: params.role,
        goal: params.goal,
        value: params.value,
        cognitiveMode: params.cognitiveMode,
        sourceRefs: params.sourceRefs,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Kickoff candidate recorded at ${state.kickoff_candidate?.artifact_path}. Stop now and ask the domain expert to run /evidence-kickoff to confirm, revise, split, defer, or stop.`,
          },
        ],
        details: { state },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_run_activity',
    label: 'Run Evidence Orchestrator Activity',
    description:
      'Execute one current-loop activity; Pair automatically runs the complete recorded coding Story until approval-ready or exceptional',
    promptSnippet:
      'Run the current Evidence Orchestrator activity in its bounded activity agent or deterministic controller',
    promptGuidelines: [
      'Use evidence_orchestrator_run_activity for the current loop; in Pair it owns the complete bounded Driver/Reviewer/controller cycle, so do not perform delegated coding in the parent agent.',
    ],
    parameters: activityRunParam,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const preparation = prepareActivityRun(ctx.cwd, {
        instructions: params.instructions ?? '',
      });
      if (isCompletedIteration(preparation)) {
        throw new Error(
          'The active Evidence Orchestrator iteration is complete.',
        );
      }
      const details = await executePreparedActivityRun(ctx, preparation, {
        invocation: 'evidence_orchestrator_run_activity',
        signal,
        onUpdate(progress) {
          onUpdate?.({
            content: [{ type: 'text', text: progress.output }],
            details: progress,
          });
        },
      });
      return {
        // This is the only child payload added to the parent model context.
        content: [{ type: 'text', text: details.output }],
        details,
      };
    },
    renderCall(args, theme) {
      return renderActivityAgentCall(args, theme);
    },
    renderResult(result, options, theme) {
      return renderActivityAgentResult(result, options, theme);
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_propose_scenarios',
    label: 'Propose Evidence Scenarios',
    description:
      'Persist a concrete Given/When/Then set for one human Story acceptance-boundary decision',
    promptSnippet:
      'Propose one to five concrete business examples after TQA is sufficient',
    promptGuidelines: [
      'Use only in the Understand TQA stage for the active Story and only when no high-value business uncertainty remains.',
      'Use concrete business data and observable results. A product-visible interaction or external interface may appear only when already confirmed; never include internal implementation steps.',
      'After calling this tool, stop. Only a human can confirm the Scenario Set, continue TQA, split, or defer.',
    ],
    parameters: scenarioDraftParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = proposeScenarioDrafts(
        ctx.cwd,
        params.storyId,
        params.candidates,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Recorded a ${state.scenario_drafts?.length ?? 0}-Scenario acceptance set for ${params.storyId.toUpperCase()}. Stop now and ask the domain expert to run /evidence-scenario.`,
          },
        ],
        details: { state },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_propose_modeling_profile',
    label: 'Propose Evidence Modeling Profile',
    description:
      'Propose the modeling subject, method, and change need for human confirmation',
    promptSnippet:
      'Classify the confirmed Scenario before modifying or expanding a model',
    promptGuidelines: [
      'Use only in Understand after a human confirms the complete Story Scenario Set.',
      'Distinguish business systems, domain systems, and tools before selecting a method.',
      'After calling this tool, stop. Only a human can confirm or override the Profile.',
    ],
    parameters: modelingProfileParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const requirement =
        params.modelChangeRequired === 'unknown'
          ? 'unknown'
          : params.modelChangeRequired === 'true';
      const state = proposeModelingProfile(ctx.cwd, {
        subject: params.subject,
        method: params.method,
        modelChangeRequired: requirement,
        reason: params.reason,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Proposed ${params.subject}/${params.method} with model_change_required=${params.modelChangeRequired}. Stop and ask the human to run /evidence-modeling-profile.`,
          },
        ],
        details: { state },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_record_model_analysis',
    label: 'Record Evidence Model Analysis',
    description:
      'Record every Story Scenario expansion and one optional structured candidate model change without editing .evidence',
    promptSnippet:
      'Expand the confirmed Scenario Set through one consistent model and record only a candidate change',
    promptGuidelines: [
      'Use only after the human confirms a non-none modeling Profile; method=none follows the deterministic no-model-impact route.',
      'Try the existing canonical model first. Expand every confirmed Scenario exactly once.',
      'Match the human change decision exactly: model_change_required=false requires operations=[]; true requires one minimal non-empty operation set.',
      'Never edit .evidence in Understand. Candidate operations are structured add/update/remove records, not shell patches.',
      'After calling this tool, stop for independent model checking.',
    ],
    parameters: modelAnalysisParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = recordModelAnalysis(ctx.cwd, {
        reason: params.reason,
        scenarios: params.scenarios,
        operations: params.operations,
      });
      return {
        content: [
          {
            type: 'text',
            text: state.model_change_proposal
              ? `Recorded model expansion and candidate proposal ${state.model_change_proposal.artifact_path}; .evidence is unchanged.`
              : `Recorded model expansion ${state.model_expansion_path}; the existing model is sufficient and no model delta was created.`,
          },
        ],
        details: { state },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_record_model_challenge',
    label: 'Record Evidence Model Challenge',
    description:
      'Record one independent read-only model challenge and route any knowledge gap',
    promptSnippet:
      'Conclude the model challenge with pass, scenario_gap, model_gap, or method_gap',
    promptGuidelines: [
      'Use only from the read-only model-challenger activity agent after checking current and regression scenarios.',
      'Do not repair the model. The tool routes feedback to TQA, Model Builder, or Modeling Profile.',
      'A pass is overridden when deterministic model regression fails.',
      'A pass stops for human model and ubiquitous-language review; it never advances Tasking directly.',
    ],
    parameters: modelChallengeParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = recordModelChallenge(ctx.cwd, {
        outcome: params.outcome,
        summary: params.summary,
      });
      const challenge = state.model_challenges?.at(-1);
      return {
        content: [
          {
            type: 'text',
            text:
              challenge?.outcome === 'pass'
                ? `Recorded passing model challenge. Stop now; a human must review the projection and run /evidence-model before Tasking.`
                : `Recorded model challenge ${challenge?.outcome}. Workflow loop=${state.loop}; next modeling stage=${state.modeling_stage ?? 'none'}.`,
          },
        ],
        details: { state, challenge },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_propose_tasking',
    label: 'Propose Evidence Tasking Draft',
    description:
      'Generate one reviewable test list, ordered task list, and deterministic v3 process plan for human Desk Check',
    promptSnippet:
      'Trace the confirmed Scenario Set and model through Q2, shared Q1, boundaries, process steps, and one implementation task list',
    promptGuidelines: [
      'Use only in Tasking after the independent challenge and human model/ubiquitous-language confirmation.',
      'Cover every confirmed Scenario/Then with exact business data and model ids; deduplicate shared Q1 support; non-goals never become tests.',
      'Give every TEST exactly one ordered TASK owner and preserve selected process-step order.',
      'Never guess among zero or multiple process matches; the tool routes that gap within Tasking.',
      'After calling this tool, stop. Only /evidence-desk-check can approve or route the draft.',
    ],
    parameters: taskingDraftParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = proposeTaskingDraft(ctx.cwd, {
        runtimes: params.runtimes.map((runtime) => ({
          id: runtime.id,
          runtime: runtime.runtime,
          functionalContexts: runtime.functionalContexts,
          technicalBoundaries: runtime.technicalBoundaries,
          ...(runtime.projectIds ? { projectIds: runtime.projectIds } : {}),
        })),
        tests: params.tests.map((test) => ({
          id: test.id,
          quadrant: test.quadrant,
          intent: test.intent,
          runtimePlanId: test.runtimePlanId,
          stepId: test.stepId,
          ...(test.projectId ? { projectId: test.projectId } : {}),
          testFilter: test.testFilter,
          supportedBy: test.supportedBy,
          scenarioIds: test.scenarioIds,
          ...(test.scenarioOutcome
            ? { scenarioOutcome: test.scenarioOutcome }
            : {}),
          businessData: test.businessData,
          modelRefs: test.modelRefs,
        })),
        tasks: params.tasks.map((task) => ({
          id: task.id,
          description: task.description,
          testIds: task.testIds,
          dependsOn: task.dependsOn,
        })),
      });
      return {
        content: [
          {
            type: 'text',
            text:
              state.tasking_stage === 'desk_check'
                ? `Tasking draft ${state.tasking_candidate?.draft_id} awaits human /evidence-desk-check.`
                : `Tasking stopped at ${state.tasking_gap?.kind}: ${state.tasking_gap?.reason}`,
          },
        ],
        details: { state },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_record_showcase_review',
    label: 'Record Evidence Showcase Review',
    description:
      'Record one independent structured, read-only Showcase review for a human decision',
    promptSnippet:
      'Separate observed facts, product/domain feedback, technical feedback, and unresolved assumptions',
    promptGuidelines: [
      'Use only from the isolated showcase-reviewer after passed Q2 and explicit Q3/Q4 decisions.',
      'Do not modify code, tests, models, plans, logs, or reports directly.',
      'A recommendation never accepts or routes the Scenario; stop for the human decision.',
    ],
    parameters: showcaseReviewParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const review = recordShowcaseReview(ctx.cwd, {
        observedFacts: params.observedFacts,
        productDomainFeedback: params.productDomainFeedback,
        technicalQualityFeedback: params.technicalQualityFeedback,
        unresolvedAssumptions: params.unresolvedAssumptions,
        recommendation: params.recommendation,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Recorded independent Showcase review ${review.artifact_path}. A human /evidence-showcase decision is required.`,
          },
        ],
        details: { review, state: readState(ctx.cwd) },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_propose_response',
    label: 'Propose Evidence Knowledge Response',
    description:
      'Propose validated knowledge decisions and one executable next Probe for human confirmation',
    promptSnippet:
      'Respond only to knowledge actually used and validated by the accepted Scenario',
    promptGuidelines: [
      'Use only in Respond after a human accepts Showcase.',
      'Promoted items must cite Scenario, Showcase decision, execution evidence, and an actually changed canonical target.',
      'Empty promotions are valid only with a concrete no-promotion reason.',
      'Do not edit canonical knowledge or complete the iteration; stop for /evidence-respond.',
    ],
    parameters: respondProposalParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const candidate = proposeKnowledgeResponse(ctx.cwd, {
        promotions: params.promotions.map((promotion) => ({
          source: promotion.source,
          kind: promotion.kind,
          decision: promotion.decision,
          reason: promotion.reason,
          validation_evidence: promotion.validationEvidence,
          ...(promotion.canonicalTarget
            ? { canonical_target: promotion.canonicalTarget }
            : {}),
        })),
        noPromotionReason: params.noPromotionReason,
        observedOutcomes: params.observedOutcomes,
        residualRisks: params.residualRisks,
        nextProbe: {
          question: params.nextProbe.question,
          why_now: params.nextProbe.whyNow,
          evidence_refs: params.nextProbe.evidenceRefs,
          first_action: params.nextProbe.firstAction,
        },
      });
      return {
        content: [
          {
            type: 'text',
            text: `Respond candidate ${candidate.artifact_path} awaits human /evidence-respond approval or revision.`,
          },
        ],
        details: { candidate, state: readState(ctx.cwd) },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_ask_question',
    label: 'Ask Evidence Orchestrator Clarification',
    description:
      'Persist one high-value TQA business-facing question and pause Understand for a domain-expert answer',
    promptSnippet: 'Ask the single next TQA clarification question',
    promptGuidelines: [
      'Use only in Understand/TQA for the single human-confirmed US-xxx Story.',
      'Ask exactly one business-facing question, then stop and wait for the user answer. It may clarify a confirmed product channel or external interaction, but must not ask for frameworks, databases, runtimes, internal components, or tests.',
      'Never answer the question yourself or call another workflow tool until the user responds.',
    ],
    parameters: clarificationQuestionParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = askClarification(ctx.cwd, {
        story_id: params.storyId,
        question: params.question,
        target: params.target,
      });
      const pending = state.pending_clarification;
      if (!pending) {
        throw new Error('Clarification was not persisted.');
      }
      return {
        content: [
          {
            type: 'text',
            text: `TQA question ${pending.question_id} recorded for ${pending.story_id}. Stop now and wait for the domain expert to answer: ${pending.question}`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_answer_question',
    label: 'Answer Evidence Orchestrator Clarification',
    description:
      'Record the domain expert’s explicit answer, route context/history answers, and return Story corrections to Kickoff before continuing clarification',
    promptSnippet:
      'Record the user’s answer and continue the interactive TQA dialogue',
    promptGuidelines: [
      'Use only when the user explicitly supplies an answer to the pending clarification question.',
      'Do not infer, fabricate, summarize, or answer on behalf of the user.',
      'evidence_orchestrator_answer_question records the answer and resumes the active Story’s persistent TQA session. A story-target answer instead returns to Kickoff for a replacement candidate. When it finishes, stop for the next human answer or decision.',
    ],
    parameters: clarificationAnswerParam,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const pending = readState(ctx.cwd).pending_clarification;
      const state = answerClarification(ctx.cwd, params.answer);
      const continuesTqa =
        state.loop === 'understand' && state.understand_stage === 'tqa';
      const preparation = prepareActivityRun(
        ctx.cwd,
        continuesTqa && pending
          ? {
              instructions: `领域专家对 ${pending.question_id} 的原文回答：\n\n问题：${pending.question}\n\n回答：${params.answer}\n\n在同一 Story TQA 会话中继续，只提出一个下一问题或完整 Scenario Set。`,
            }
          : {},
      );
      if (isCompletedIteration(preparation)) {
        throw new Error(
          'The active Evidence Orchestrator iteration is complete.',
        );
      }
      const details = await executePreparedActivityRun(ctx, preparation, {
        invocation: 'evidence_orchestrator_answer_question',
        signal,
        onUpdate(progress) {
          onUpdate?.({
            content: [{ type: 'text', text: progress.output }],
            details: progress,
          });
        },
      });
      return {
        content: [
          {
            type: 'text',
            text: `Recorded the answer. Clarification history contains ${state.clarification_history?.length ?? 0} answered exchange(s).\n\n${details.output}`,
          },
        ],
        details,
        terminate: true,
      };
    },
    renderResult(result, options, theme) {
      return renderActivityAgentResult(result, options, theme);
    },
  });
}
