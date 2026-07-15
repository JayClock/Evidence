import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
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
  startIterationFromIssueAsync,
  syncIssueSourceAsync,
} from '../../capabilities/issue-source/github-issue-source';
import {
  isActivitySubagentFailureDetails,
  renderActivitySubagentCall,
  renderActivitySubagentResult,
} from './activity/subagent-renderer';
import {
  readPersistedState,
  readState,
} from '../../iteration/state-repository';
import { createGitHubCliRunner } from '../github/pi-cli';
import { statusMarkdown } from './status';
import { proposeTaskingDraft } from '../../loops/tasking/tasking-draft';
import { recordShowcaseReview } from '../../loops/showcase/showcase-session';
import { isCompletedIteration, prepareActivityRun } from './activity/dispatch';
import { executePreparedActivityRun } from './activity/execution';

import {
  Type,
  activityRunParam,
  clarificationAnswerParam,
  clarificationQuestionParam,
  issueSourceParam,
  kickoffCandidateParam,
  modelAnalysisParam,
  modelChallengeParam,
  modelingProfileParam,
  respondProposalParam,
  scenarioDraftParam,
  showcaseReviewParam,
  taskingDraftParam,
} from './tool-schemas';

export function registerTools(pi: ExtensionAPI): void {
  pi.on('tool_result', (event) => {
    if (
      (event.toolName === 'evidence_orchestrator_run_activity' ||
        event.toolName === 'evidence_orchestrator_answer_question') &&
      isActivitySubagentFailureDetails(event.details)
    ) {
      return { isError: true };
    }
    return undefined;
  });

  pi.registerTool({
    name: 'evidence_orchestrator_start_from_issue',
    label: 'Start Evidence Orchestrator From Issue',
    description:
      'Start a new isolated Evidence iteration from a frozen GitHub Issue snapshot',
    promptSnippet:
      'Use a GitHub Issue as the requirement authority for a new iteration',
    promptGuidelines: [
      'Use only when the user explicitly identifies the GitHub Issue that should seed a new iteration.',
      'Do not create or infer an Issue number.',
    ],
    parameters: issueSourceParam,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const issueNumber = Number(params.issueNumber);
      onUpdate?.({
        content: [
          {
            type: 'text',
            text: `Loading GitHub Issue #${issueNumber} and creating an iteration…`,
          },
        ],
        details: { status: 'loading', issueNumber },
      });
      const state = await startIterationFromIssueAsync(
        ctx.cwd,
        {
          issueNumber,
          repository: params.repository,
        },
        createGitHubCliRunner(pi),
        signal,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Started ${state.iteration_id} from ${state.requirement_source?.repository}#${state.requirement_source?.issue_number}.`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_sync_issue',
    label: 'Sync Evidence Orchestrator Issue',
    description:
      'Explicitly refresh the active GitHub Issue snapshot while still in Kickoff',
    promptSnippet:
      'Refresh the frozen requirement snapshot from its GitHub Issue',
    promptGuidelines: [
      'Use only when the user explicitly requests a refresh and the workflow is still in frame.',
      'After frame, preserve the current snapshot and start a new iteration for changed requirements.',
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, onUpdate, ctx) {
      onUpdate?.({
        content: [
          {
            type: 'text',
            text: 'Refreshing the GitHub Issue snapshot…',
          },
        ],
        details: { status: 'loading' },
      });
      const state = await syncIssueSourceAsync(
        ctx.cwd,
        createGitHubCliRunner(pi),
        signal,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Refreshed ${state.requirement_source?.repository}#${state.requirement_source?.issue_number} for ${state.iteration_id}.`,
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
    parameters: Type.Object({}),
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
      'Propose one Issue-backed Story candidate without assigning a Story id',
    promptGuidelines: [
      'Use only in the kickoff loop after reading the Issue and stable product context.',
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
        cognitiveMode: params.cognitiveMode as
          | 'clear'
          | 'complicated'
          | 'complex',
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
      'Execute exactly one checkpoint of the current knowledge-loop activity',
    promptSnippet:
      'Run the current Evidence Orchestrator activity in its bounded subagent or deterministic controller',
    promptGuidelines: [
      'Use evidence_orchestrator_run_activity to execute one current-loop checkpoint; do not perform delegated work in the parent agent.',
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
      return renderActivitySubagentCall(args, theme);
    },
    renderResult(result, options, theme) {
      return renderActivitySubagentResult(result, options, theme);
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_propose_scenarios',
    label: 'Propose Evidence Scenarios',
    description:
      'Persist concrete Given/When/Then drafts for one human Scenario decision',
    promptSnippet:
      'Propose one to five concrete business examples after TQA is sufficient',
    promptGuidelines: [
      'Use only in the Understand TQA stage for the active Story and only when no high-value business uncertainty remains.',
      'Use concrete business data and observable results; do not include implementation steps.',
      'After calling this tool, stop. Only a human can confirm one Scenario, continue TQA, split, or defer.',
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
            text: `Recorded ${state.scenario_drafts?.length ?? 0} Scenario draft(s) for ${params.storyId.toUpperCase()}. Stop now and ask the domain expert to run /evidence-scenario.`,
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
      'Use only in Understand after a human confirms one Scenario.',
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
        subject: params.subject as 'business' | 'domain' | 'tool',
        method: params.method as
          | 'none'
          | 'object'
          | 'event'
          | 'four_color'
          | 'eight_x_flow'
          | 'algorithmic',
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
      'Record one Scenario expansion and an optional structured candidate model change without editing .evidence',
    promptSnippet:
      'Expand the confirmed Scenario through the selected model and record only a candidate change',
    promptGuidelines: [
      'Use only after the human confirms a modeling Profile.',
      'Try the existing canonical model first. Operations must be empty when it already explains the Scenario.',
      'Never edit .evidence in Understand. Candidate operations are structured add/update/remove records, not shell patches.',
      'After calling this tool, stop for independent model checking.',
    ],
    parameters: modelAnalysisParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = recordModelAnalysis(ctx.cwd, {
        reason: params.reason,
        modelRefs: params.modelRefs,
        given: params.given,
        when: params.when,
        then: params.then,
        invariants: params.invariants,
        timeline: params.timeline,
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
      'Use only from the read-only model-challenger subagent after checking current and regression scenarios.',
      'Do not repair the model. The tool routes feedback to TQA, Model Builder, or Modeling Profile.',
      'A pass is overridden when deterministic model regression fails.',
    ],
    parameters: modelChallengeParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = recordModelChallenge(ctx.cwd, {
        outcome: params.outcome as
          | 'pass'
          | 'scenario_gap'
          | 'model_gap'
          | 'method_gap',
        summary: params.summary,
      });
      const challenge = state.model_challenges?.at(-1);
      return {
        content: [
          {
            type: 'text',
            text: `Recorded model challenge ${challenge?.outcome}. Workflow loop=${state.loop}; next modeling stage=${state.modeling_stage ?? 'none'}.`,
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
      'Generate one reviewable test list, ordered task list, and deterministic v2 process plan for human Desk Check',
    promptSnippet:
      'Trace the confirmed Scenario through Q2, Q1, boundaries, process steps, and implementation tasks',
    promptGuidelines: [
      'Use only in Tasking after the independent model challenge passes.',
      'Use exact confirmed Scenario outcomes and business data; non-goals never become tests.',
      'Never guess among zero or multiple process matches; the tool routes that gap within Tasking.',
      'After calling this tool, stop. Only /evidence-desk-check can approve or route the draft.',
    ],
    parameters: taskingDraftParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = proposeTaskingDraft(ctx.cwd, {
        runtimes: params.runtimes.map((runtime) => ({
          id: runtime.id,
          runtime: runtime.runtime as 'rust' | 'typescript' | 'tauri',
          functionalContexts: runtime.functionalContexts,
          technicalBoundaries: runtime.technicalBoundaries,
          testFilter: runtime.testFilter,
        })),
        tests: params.tests.map((test) => ({
          id: test.id,
          quadrant: test.quadrant as 'Q1' | 'Q2',
          intent: test.intent,
          runtimePlanId: test.runtimePlanId,
          stepId: test.stepId,
          supportedBy: test.supportedBy,
          ...(test.scenarioOutcome
            ? { scenarioOutcome: test.scenarioOutcome }
            : {}),
          businessData: test.businessData,
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
        recommendation: params.recommendation as 'accept' | 'revise',
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
          kind: promotion.kind as
            | 'product'
            | 'model'
            | 'architecture'
            | 'contract'
            | 'test_process'
            | 'skill'
            | 'prompt'
            | 'other',
          decision: promotion.decision as 'promoted' | 'deferred' | 'rejected',
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
      'Persist one high-value TQA business question and pause Understand for a domain-expert answer',
    promptSnippet: 'Ask the single next TQA clarification question',
    promptGuidelines: [
      'Use only in Understand/TQA for the single human-confirmed US-xxx Story.',
      'Ask exactly one non-technical business question, then stop and wait for the user answer.',
      'Never answer the question yourself or call another workflow tool until the user responds.',
    ],
    parameters: clarificationQuestionParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = askClarification(ctx.cwd, {
        story_id: params.storyId,
        question: params.question,
        target: params.target as 'business_context' | 'story' | 'history',
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
      'Record the domain expert’s explicit answer, route it to its knowledge artifact, and continue the active story clarification',
    promptSnippet:
      'Record the user’s answer and continue the interactive TQA dialogue',
    promptGuidelines: [
      'Use only when the user explicitly supplies an answer to the pending clarification question.',
      'Do not infer, fabricate, summarize, or answer on behalf of the user.',
      'evidence_orchestrator_answer_question automatically resumes the isolated clarification after recording the answer; when it finishes, stop and wait for the user if another question is pending.',
    ],
    parameters: clarificationAnswerParam,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const state = answerClarification(ctx.cwd, params.answer);
      const preparation = prepareActivityRun(ctx.cwd);
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
      return renderActivitySubagentResult(result, options, theme);
    },
  });
}
