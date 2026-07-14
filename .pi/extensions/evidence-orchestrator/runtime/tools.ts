import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { collectArtifacts, collectCodeFiles } from '../evidence/artifact-index';
import {
  answerClarification,
  askClarification,
  proposeClarificationStoryOutcome,
  selectClarificationStory,
} from '../requirements/clarifications';
import { proposeKickoffCandidate } from '../requirements/kickoff';
import {
  answerGate,
  completePhase,
  isGateAnswered,
  recordPhaseFailure,
} from '../workflow/gates';
import {
  startIterationFromIssueAsync,
  syncIssueSourceAsync,
} from '../requirements/github-issue';
import { PHASE_META } from '../workflow/phase-catalog';
import {
  isPhaseSubagentFailureDetails,
  renderPhaseSubagentCall,
  renderPhaseSubagentResult,
} from './phase-subagent-renderer';
import {
  readState,
  selectTestProcess,
  selectWorkItem,
} from '../workflow/state-store';
import { createGitHubCliRunner } from './github-cli';
import { statusMarkdown } from './status';
import { executeTestStep } from '../testing/execution-recorder';
import { isCompletedIteration, preparePhaseRun } from './phase-dispatch';
import { executePreparedPhaseRun } from './phase-execution';
import {
  listSelectableClarificationStories,
  selectClarificationStoryInteractively,
} from './story-picker';
import type { ClarificationStoryOutcome, Phase } from '../workflow/types';

type JsonSchema = Record<string, unknown> & { __optional?: boolean };

const Type = {
  String(options: Record<string, unknown> = {}): JsonSchema {
    return { type: 'string', ...options };
  },
  Optional(schema: JsonSchema): JsonSchema {
    return { ...schema, __optional: true };
  },
  Array(items: JsonSchema): JsonSchema {
    const { __optional, ...rest } = items;
    return {
      type: 'array',
      items: rest,
      ...(__optional ? { __optional } : {}),
    };
  },
  Object(properties: Record<string, JsonSchema>): JsonSchema {
    const cleaned: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(properties)) {
      const { __optional, ...rest } = schema;
      cleaned[key] = rest;
      if (!__optional) required.push(key);
    }
    return {
      type: 'object',
      properties: cleaned,
      required,
      additionalProperties: false,
    };
  },
};

const issueSourceParam = Type.Object({
  issueNumber: Type.String({
    description: 'GitHub Issue number, for example 123.',
  }),
  repository: Type.Optional(
    Type.String({
      description:
        'Optional owner/repository. Defaults to the current GitHub repository.',
    }),
  ),
});

const phaseRunParam = Type.Object({
  instructions: Type.Optional(
    Type.String({
      description: 'Extra instructions for the current phase subagent.',
    }),
  ),
});

const phaseFailureParam = Type.Object({
  phase: Type.String({ description: 'The phase whose Check step failed.' }),
  summary: Type.String({
    description:
      'Concrete failed validation or command result for the next PDCA attempt.',
  }),
});

const kickoffCandidateParam = Type.Object({
  title: Type.String({ description: 'Short candidate Story title.' }),
  problem: Type.String({
    description: 'One user or business problem, without an implementation.',
  }),
  role: Type.String({
    description: 'The user or business role that benefits.',
  }),
  goal: Type.String({ description: 'The negotiable outcome the role wants.' }),
  value: Type.String({ description: 'The business or user value produced.' }),
  cognitiveMode: Type.String({
    description: 'Current team cognitive behavior, not a permanent label.',
    enum: ['clear', 'complicated', 'complex'],
  }),
  sourceRefs: Type.Array(
    Type.String({
      description:
        'Issue or stable product-context path and heading reference.',
    }),
  ),
});

const clarificationQuestionParam = Type.Object({
  storyId: Type.String({
    description:
      'The US-xxx story whose business uncertainty is being clarified.',
  }),
  question: Type.String({
    description:
      'One high-value, non-technical question for the domain expert. Ask only one question, then stop.',
  }),
  target: Type.String({
    description:
      'Where an answer belongs: business_context, story, or history.',
  }),
});

const clarificationAnswerParam = Type.Object({
  answer: Type.String({
    description:
      'The domain expert’s explicit answer to the sole pending clarification question.',
  }),
});

const clarificationStoryParam = Type.Object({});

const clarificationStoryOutcomeProposalParam = Type.Object({
  storyId: Type.String({
    description: 'The active clarification story id, for example US-001.',
  }),
  outcome: Type.String({
    description: 'Story clarification outcome.',
    enum: ['clarified', 'needs_split', 'deferred'],
  }),
  summary: Type.String({
    description: 'Brief business reason for the story outcome.',
  }),
});

const testProcessParam = Type.Object({
  runtime: Type.String({
    description: 'Owning runtime: rust, typescript, or tauri.',
  }),
  functionalContexts: Type.Array(
    Type.String({
      description: 'One functional context declared by the architecture.',
    }),
  ),
});

const workItemParam = Type.Object({
  storyId: Type.String({
    description: 'The selected story id, for example US-001.',
  }),
  scenarioId: Type.String({
    description:
      'The selected concrete acceptance scenario id, for example SC-001.',
  }),
});

const executionStepParam = Type.Object({
  processId: Type.String({
    description: 'Selected test-process id that declares the command.',
  }),
  stage: Type.String({
    description: 'TDD stage: red, green, refactor, or quality_gate.',
  }),
  command: Type.String({
    description: 'An exact command declared in that process quality_gates.',
  }),
});

export function registerTools(pi: ExtensionAPI): void {
  pi.on('tool_result', (event) => {
    if (
      (event.toolName === 'evidence_orchestrator_run_phase' ||
        event.toolName === 'evidence_orchestrator_select_story' ||
        event.toolName === 'evidence_orchestrator_answer_question') &&
      isPhaseSubagentFailureDetails(event.details)
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
      'Explicitly refresh the active GitHub Issue snapshot while still in frame',
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
      'Read Evidence Orchestrator state, gates, artifacts, and code files',
    promptSnippet: 'Inspect the current Evidence Orchestrator pipeline status',
    promptGuidelines: [
      'Use evidence_orchestrator_status when the user asks what the Evidence Orchestrator pipeline is doing or what remains.',
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      return {
        content: [{ type: 'text', text: statusMarkdown(ctx.cwd) }],
        details: {
          state: readState(ctx.cwd),
          artifacts: collectArtifacts(ctx.cwd),
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
      'Use only in a v5 kickoff loop after reading the Issue and stable product context.',
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
    name: 'evidence_orchestrator_run_phase',
    label: 'Run Evidence Orchestrator Phase Subagent',
    description:
      'Execute the current Evidence Orchestrator phase in its isolated project subagent',
    promptSnippet:
      'Run the current Evidence Orchestrator phase in its dedicated subagent',
    promptGuidelines: [
      'Use evidence_orchestrator_run_phase to execute the current workflow phase; do not execute phase work in the parent agent.',
    ],
    parameters: phaseRunParam,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const current = readState(ctx.cwd);
      if (
        current.phase === 'clarify' &&
        !current.active_clarification_story &&
        !current.pending_gate &&
        !current.halted &&
        listSelectableClarificationStories(ctx.cwd).length > 0
      ) {
        const selectedStory = await selectClarificationStoryInteractively(ctx);
        if (!selectedStory) throw new Error('Story selection cancelled.');
        selectClarificationStory(ctx.cwd, selectedStory);
      }
      const preparation = preparePhaseRun(ctx.cwd, {
        instructions: params.instructions ?? '',
      });
      if (isCompletedIteration(preparation)) {
        throw new Error(
          'The active Evidence Orchestrator iteration is complete.',
        );
      }
      const details = await executePreparedPhaseRun(ctx, preparation, {
        invocation: 'evidence_orchestrator_run_phase',
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
      return renderPhaseSubagentCall(args, theme);
    },
    renderResult(result, options, theme) {
      return renderPhaseSubagentResult(result, options, theme);
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_select_story',
    label: 'Select Evidence Clarification Story',
    description:
      'Open an interactive picker, select, resume, or switch stories, and run isolated clarification',
    promptSnippet:
      'Let the user select, resume, or switch to one US-xxx story for isolated TQA clarification',
    promptGuidelines: [
      'Use evidence_orchestrator_select_story when the user asks to choose, resume, or switch stories for clarification; the tool opens the picker and the user makes the decision.',
      'Never infer or pass a story choice on behalf of the user.',
      'The user may switch to any unresolved story at any time; switching pauses the current story’s open question or proposal and restores the selected story’s state.',
      'After evidence_orchestrator_select_story finishes the isolated clarify run, stop and do not call another workflow tool.',
    ],
    parameters: clarificationStoryParam,
    async execute(_toolCallId, _params, signal, onUpdate, ctx) {
      const selectedStory = await selectClarificationStoryInteractively(ctx);
      if (!selectedStory) throw new Error('Story selection cancelled.');
      const state = selectClarificationStory(ctx.cwd, selectedStory);
      const preparation = preparePhaseRun(ctx.cwd);
      if (isCompletedIteration(preparation)) {
        throw new Error(
          'The active Evidence Orchestrator iteration is complete.',
        );
      }
      const details = await executePreparedPhaseRun(ctx, preparation, {
        invocation: 'evidence_orchestrator_select_story',
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
            text: `Selected clarification story ${state.active_clarification_story?.story_id}.\n\n${details.output}`,
          },
        ],
        details,
        terminate: true,
      };
    },
    renderResult(result, options, theme) {
      return renderPhaseSubagentResult(result, options, theme);
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_ask_question',
    label: 'Ask Evidence Orchestrator Clarification',
    description:
      'Persist one high-value TQA business question and pause the clarification phase for a domain-expert answer',
    promptSnippet: 'Ask the single next TQA clarification question',
    promptGuidelines: [
      'Use only in the clarify phase for the active human-selected US-xxx story.',
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
      const preparation = preparePhaseRun(ctx.cwd);
      if (isCompletedIteration(preparation)) {
        throw new Error(
          'The active Evidence Orchestrator iteration is complete.',
        );
      }
      const details = await executePreparedPhaseRun(ctx, preparation, {
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
      return renderPhaseSubagentResult(result, options, theme);
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_propose_story_outcome',
    label: 'Propose Evidence Story Clarification Outcome',
    description:
      'Propose an outcome for the active story without completing or releasing it',
    promptSnippet:
      'Propose clarified, needs_split, or deferred for human confirmation',
    promptGuidelines: [
      'Use evidence_orchestrator_propose_story_outcome only in clarify for the active human-selected story after its pending TQA answer is resolved.',
      'After calling evidence_orchestrator_propose_story_outcome, stop and wait for the domain expert to decide through /evidence-story-complete.',
      'evidence_orchestrator_propose_story_outcome never completes or releases a story; never claim that the proposed outcome is final.',
      'Propose clarified only when no high-value business uncertainty remains; otherwise propose needs_split or deferred with a concrete reason.',
    ],
    parameters: clarificationStoryOutcomeProposalParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = proposeClarificationStoryOutcome(
        ctx.cwd,
        params.storyId,
        params.outcome as ClarificationStoryOutcome,
        params.summary,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Proposed ${params.outcome} for ${params.storyId.toUpperCase()}; the story remains active. Stop now and ask the domain expert to run /evidence-story-complete to confirm, override, or continue clarification.`,
          },
        ],
        details: { state },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_select_work_item',
    label: 'Select Evidence Orchestrator Work Item',
    description:
      'Select the single user-story acceptance scenario that the coding phase may implement',
    promptSnippet:
      'Select one US-xxx / SC-xxx work item for the Evidence Orchestrator coding phase',
    promptGuidelines: [
      'Use evidence_orchestrator_select_work_item before changing code in the Evidence Orchestrator coding phase; code exactly one selected user-story scenario at a time.',
    ],
    parameters: workItemParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = selectWorkItem(ctx.cwd, params.storyId, params.scenarioId);
      return {
        content: [
          {
            type: 'text',
            text: `Selected coding work item: ${state.active_work_item?.story_id} / ${state.active_work_item?.scenario_id}.`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_select_test_process',
    label: 'Select Evidence Orchestrator Test Process',
    description:
      'Bind the selected coding scenario to one matching, machine-readable test process before code changes',
    promptSnippet:
      'Select the test process matching the active scenario runtime and functional contexts',
    promptGuidelines: [
      'Use after selecting the US-xxx / SC-xxx coding work item and before writing tests or production code.',
      'Provide the runtime and all functional contexts declared for the scenario; selection fails on zero or multiple matches.',
    ],
    parameters: testProcessParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = selectTestProcess(
        ctx.cwd,
        params.runtime as 'rust' | 'typescript' | 'tauri',
        params.functionalContexts,
      );
      const selected = state.active_work_item?.test_process;
      return {
        content: [
          {
            type: 'text',
            text: `Selected test process ${selected?.id} for ${state.active_work_item?.story_id} / ${state.active_work_item?.scenario_id}.`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_run_test_step',
    label: 'Run Evidence Orchestrator Test Step',
    description:
      'Run a selected test-process quality command and append tamper-evident execution evidence',
    promptSnippet:
      'Run one declared TDD test command and persist its observed result',
    promptGuidelines: [
      'Use only in coding after selecting the work item and every applicable test process.',
      'Run only the exact quality-gate command declared by the selected process.',
      'Record Red, Green, Refactor, and quality-gate observations instead of manually inventing exit codes.',
    ],
    parameters: executionStepParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const stage = params.stage as
        | 'red'
        | 'green'
        | 'refactor'
        | 'quality_gate';
      if (!['red', 'green', 'refactor', 'quality_gate'].includes(stage)) {
        throw new Error(`Unsupported test execution stage: ${params.stage}.`);
      }
      const record = executeTestStep(ctx.cwd, {
        processId: params.processId,
        stage,
        command: params.command,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Recorded ${record.stage} for ${record.process_id}: exit=${record.exit_code}.`,
          },
        ],
        details: record,
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_complete_phase',
    label: 'Evidence Orchestrator Complete Phase',
    description:
      'Mark an Evidence Orchestrator phase complete, update state, and create a gate if configured',
    promptSnippet:
      'Complete an Evidence Orchestrator phase after all required artifacts and code are written',
    promptGuidelines: [
      'Use evidence_orchestrator_complete_phase after finishing all required outputs for an Evidence Orchestrator phase.',
    ],
    parameters: Type.Object({
      phase: Type.String({ description: 'Completed phase name' }),
      summary: Type.Optional(
        Type.String({ description: 'Brief completion summary' }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.phase === 'complete' || !(params.phase in PHASE_META)) {
        throw new Error(`Invalid phase for completion: ${params.phase}`);
      }
      try {
        const state = completePhase(
          ctx.cwd,
          params.phase as Exclude<Phase, 'complete'>,
          params.summary ?? '',
        );
        return {
          content: [
            {
              type: 'text',
              text: `Completed ${params.phase}. Next phase=${state.phase}. Pending gate=${state.pending_gate ?? 'none'}.`,
            },
          ],
          details: { state },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const current = readState(ctx.cwd);
        if (
          current.phase !== params.phase ||
          current.pending_gate ||
          current.halted ||
          (current.workflow_version === 5 && current.loop === 'kickoff')
        ) {
          throw new Error(message);
        }
        const failed = recordPhaseFailure(
          ctx.cwd,
          params.phase as Exclude<Phase, 'complete'>,
          params.summary || message,
        );
        throw new Error(
          `${message} Check failure recorded for ${failed.iteration_id}, round ${failed.round}.`,
        );
      }
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_report_phase_failure',
    label: 'Evidence Orchestrator Report Phase Failure',
    description:
      'Record a failed Check step, persist feedback, and trigger an emergency gate at the retry limit',
    promptSnippet:
      'Record a failed Evidence Orchestrator Check step for PDCA retry',
    promptGuidelines: [
      'Use after a deterministic validation or quality check fails and before retrying the same phase.',
    ],
    parameters: phaseFailureParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.phase === 'complete' || !(params.phase in PHASE_META)) {
        throw new Error(`Invalid phase for failure recording: ${params.phase}`);
      }
      const state = recordPhaseFailure(
        ctx.cwd,
        params.phase as Exclude<Phase, 'complete'>,
        params.summary,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Recorded failed Check for ${params.phase}: round=${state.round}, pending gate=${state.pending_gate ?? 'none'}.`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_gate',
    label: 'Evidence Orchestrator Gate',
    description: 'Write a decision into an Evidence Orchestrator gate file',
    promptSnippet: 'Answer a pending Evidence Orchestrator Markdown gate',
    promptGuidelines: [
      'Use evidence_orchestrator_gate only when the user explicitly approves, rejects, or answers an Evidence Orchestrator gate.',
    ],
    parameters: Type.Object({
      gateId: Type.String({
        description: 'Gate id, e.g. GATE-001-requirements',
      }),
      decision: Type.String({ description: 'Decision text to write' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { gatePath } = answerGate(ctx.cwd, params.gateId, params.decision);
      return {
        content: [
          {
            type: 'text',
            text: `Gate answered: ${params.gateId}. Answered=${isGateAnswered(ctx.cwd, params.gateId)}`,
          },
        ],
        details: { gatePath },
      };
    },
  });
}
