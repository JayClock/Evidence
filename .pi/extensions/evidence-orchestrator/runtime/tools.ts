import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { collectArtifacts, collectCodeFiles } from '../evidence/artifact-index';
import {
  answerClarification,
  askClarification,
} from '../requirements/clarifications';
import {
  startIterationFromIssueAsync,
  syncIssueSourceAsync,
} from '../requirements/github-issue';
import { executeTestStep } from '../testing/execution-recorder';
import {
  answerGate,
  completePhase,
  isGateAnswered,
  recordPhaseFailure,
} from '../workflow/gates';
import { PHASE_META } from '../workflow/phase-catalog';
import {
  readState,
  selectTestProcess,
  selectWorkItem,
  selectedTestProcesses,
} from '../workflow/state-store';
import type { ActivePhase } from '../workflow/types';
import { createGitHubCliRunner } from './github-cli';
import { isCompletedIteration, preparePhaseRun } from './phase-dispatch';
import { executePreparedPhaseRun } from './phase-execution';
import {
  isPhaseSubagentFailureDetails,
  renderPhaseSubagentCall,
  renderPhaseSubagentResult,
} from './phase-subagent-renderer';
import { statusMarkdown } from './status';

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

const clarificationQuestionParam = Type.Object({
  storyId: Type.String({
    description: 'The sole Kickoff Story id, for example US-001.',
  }),
  thought: Type.String({
    description:
      'Why this is the highest-value remaining business uncertainty.',
  }),
  question: Type.String({
    description:
      'One concise, non-technical question for the domain expert. Ask it and stop.',
  }),
});

const testProcessParam = Type.Object({
  runtime: Type.String({
    description: 'Owning runtime: rust, typescript, or tauri.',
  }),
  functionalContexts: Type.Array(
    Type.String({
      description: 'One functional context declared by Delivery Design.',
    }),
  ),
});

export function registerTools(pi: ExtensionAPI): void {
  pi.on('tool_result', (event) => {
    if (
      (event.toolName === 'evidence_orchestrator_run_phase' ||
        event.toolName === 'evidence_orchestrator_answer_question') &&
      isPhaseSubagentFailureDetails(event.details)
    ) {
      return { isError: true };
    }
    return undefined;
  });

  pi.registerTool({
    name: 'evidence_orchestrator_start_from_issue',
    label: 'Start Evidence Iteration From Issue',
    description:
      'Start a clean single-Story iteration from a frozen GitHub Issue snapshot',
    promptSnippet:
      'Use an explicitly identified GitHub Issue as the iteration authority',
    promptGuidelines: [
      'Use evidence_orchestrator_start_from_issue only when the user explicitly identifies the GitHub Issue.',
      'Never create or infer an Issue number on the user’s behalf.',
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
        { issueNumber, repository: params.repository },
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
    label: 'Refresh Evidence Issue Snapshot',
    description: 'Refresh the frozen GitHub Issue snapshot during Kickoff only',
    promptSnippet: 'Refresh the active Issue snapshot during Kickoff',
    promptGuidelines: [
      'Use evidence_orchestrator_sync_issue only when the user explicitly requests a refresh and the phase is kickoff.',
      'After Kickoff, preserve the snapshot and start a new iteration for changed requirements.',
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, onUpdate, ctx) {
      onUpdate?.({
        content: [
          { type: 'text', text: 'Refreshing the GitHub Issue snapshot…' },
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
            text: `Refreshed ${state.requirement_source?.repository}#${state.requirement_source?.issue_number}.`,
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
      'Read the current feedback loop, gate, artifacts, and code files',
    promptSnippet: 'Inspect the Evidence Orchestrator feedback loop',
    promptGuidelines: [
      'Use evidence_orchestrator_status when the user asks what the workflow is doing or what remains.',
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
    name: 'evidence_orchestrator_run_phase',
    label: 'Run Evidence Phase Subagent',
    description:
      'Execute the current feedback-loop phase in its isolated agent',
    promptSnippet: 'Run the current phase in its dedicated subagent',
    promptGuidelines: [
      'Use evidence_orchestrator_run_phase for phase work; do not perform that work in the parent agent.',
    ],
    parameters: Type.Object({
      instructions: Type.Optional(
        Type.String({
          description: 'Extra instructions for the current phase.',
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const preparation = preparePhaseRun(ctx.cwd, {
        instructions: params.instructions ?? '',
      });
      if (isCompletedIteration(preparation)) {
        throw new Error(preparation.task);
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
    name: 'evidence_orchestrator_ask_question',
    label: 'Ask Evidence TQA Question',
    description:
      'Record one Thought and one high-value business Question, then wait for the domain expert',
    promptSnippet: 'Ask the sole next TQA business question',
    promptGuidelines: [
      'Use evidence_orchestrator_ask_question only during discover for the sole Kickoff Story.',
      'Record one Thought and ask exactly one non-technical Question, then stop.',
      'Never answer the Question yourself or call another workflow tool before the user responds.',
    ],
    parameters: clarificationQuestionParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = askClarification(ctx.cwd, {
        story_id: params.storyId,
        thought: params.thought,
        question: params.question,
      });
      const pending = state.pending_clarification;
      if (!pending) throw new Error('TQA question was not persisted.');
      return {
        content: [
          {
            type: 'text',
            text: `Recorded ${pending.question_id} for ${pending.story_id}. Stop and wait for the domain expert: ${pending.question}`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_answer_question',
    label: 'Record Evidence TQA Answer',
    description:
      'Record the domain expert’s explicit answer and resume isolated Discover',
    promptSnippet:
      'Record the user’s explicit TQA answer and continue Discover',
    promptGuidelines: [
      'Use evidence_orchestrator_answer_question only when the user explicitly answers the pending TQA Question.',
      'Do not infer, fabricate, translate, or summarize an answer on the user’s behalf.',
      'After the resumed Discover agent finishes, stop and wait if it asks another Question.',
    ],
    parameters: Type.Object({
      answer: Type.String({
        description: 'The domain expert’s explicit answer.',
      }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const state = answerClarification(ctx.cwd, params.answer);
      const preparation = preparePhaseRun(ctx.cwd);
      if (isCompletedIteration(preparation)) throw new Error(preparation.task);
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
            text: `Recorded the answer; ${state.clarification_history?.length ?? 0} TQA exchange(s) answered.\n\n${details.output}`,
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
    name: 'evidence_orchestrator_select_work_item',
    label: 'Select Evidence Build Scenario',
    description: 'Bind Build to the sole Story and one acceptance Scenario',
    promptSnippet:
      'Select the one US-xxx / SC-xxx scenario Build may implement',
    promptGuidelines: [
      'Use evidence_orchestrator_select_work_item before changing code in build; implement exactly one acceptance Scenario.',
    ],
    parameters: Type.Object({
      storyId: Type.String({ description: 'The sole Story id, e.g. US-001.' }),
      scenarioId: Type.String({
        description: 'The selected Scenario id, e.g. SC-001.',
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = selectWorkItem(ctx.cwd, params.storyId, params.scenarioId);
      return {
        content: [
          {
            type: 'text',
            text: `Selected Build work item: ${state.active_work_item?.story_id} / ${state.active_work_item?.scenario_id}.`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_select_test_process',
    label: 'Select Evidence Test Process',
    description:
      'Bind the active Scenario to the uniquely matching test process before code changes',
    promptSnippet:
      'Select the process matching runtime and functional contexts',
    promptGuidelines: [
      'Use evidence_orchestrator_select_test_process after selecting the Build work item and before writing tests or production code.',
      'Pass every functional context declared by Delivery Design; zero or multiple matches must return to Design.',
    ],
    parameters: testProcessParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = selectTestProcess(
        ctx.cwd,
        params.runtime as 'rust' | 'typescript' | 'tauri',
        params.functionalContexts,
      );
      const workItem = state.active_work_item;
      const selected = workItem
        ? selectedTestProcesses(workItem).at(-1)
        : undefined;
      return {
        content: [
          {
            type: 'text',
            text: `Selected test process ${selected?.id} for ${workItem?.story_id} / ${workItem?.scenario_id}.`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_run_test_step',
    label: 'Run Evidence Test Step',
    description:
      'Run a declared process command and append tamper-evident execution facts',
    promptSnippet: 'Run one declared TDD or quality command and record it',
    promptGuidelines: [
      'Use evidence_orchestrator_run_test_step only during Build after selecting every applicable process.',
      'Run only an exact command declared by the selected process.',
      'A Red observation is valid only when the focused assertion fails for the expected missing business behavior.',
    ],
    parameters: Type.Object({
      processId: Type.String({ description: 'Selected test-process id.' }),
      stage: Type.String({
        description: 'red, green, refactor, or quality_gate.',
      }),
      command: Type.String({ description: 'Exact declared command.' }),
    }),
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
    label: 'Complete Evidence Phase',
    description:
      'Run deterministic checks, advance, and create feedback Gate if configured',
    promptSnippet:
      'Complete the current phase after outputs and checks are ready',
    promptGuidelines: [
      'Use evidence_orchestrator_complete_phase only after all required outputs and deterministic checks for the current phase are ready.',
    ],
    parameters: Type.Object({
      phase: Type.String({ description: 'Current active phase name.' }),
      summary: Type.Optional(
        Type.String({ description: 'Brief completion or feedback summary.' }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!(params.phase in PHASE_META)) {
        throw new Error(`Invalid phase for completion: ${params.phase}`);
      }
      try {
        const state = completePhase(
          ctx.cwd,
          params.phase as ActivePhase,
          params.summary ?? '',
        );
        return {
          content: [
            {
              type: 'text',
              text: `Completed ${params.phase}. Next=${state.phase}. Pending Gate=${state.pending_gate ?? 'none'}.`,
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
          current.halted
        ) {
          throw new Error(message);
        }
        const failed = recordPhaseFailure(
          ctx.cwd,
          params.phase as ActivePhase,
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
    label: 'Report Evidence Phase Failure',
    description:
      'Persist a deterministic Check failure and open an emergency Gate at the retry limit',
    promptSnippet: 'Record a failed Check before retrying the same phase',
    promptGuidelines: [
      'Use evidence_orchestrator_report_phase_failure after a deterministic validation fails and before retrying the phase.',
    ],
    parameters: Type.Object({
      phase: Type.String({ description: 'The active phase that failed.' }),
      summary: Type.String({ description: 'Concrete observed failure.' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!(params.phase in PHASE_META)) {
        throw new Error(`Invalid phase for failure recording: ${params.phase}`);
      }
      const state = recordPhaseFailure(
        ctx.cwd,
        params.phase as ActivePhase,
        params.summary,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Recorded failed Check for ${params.phase}: round=${state.round}, pending Gate=${state.pending_gate ?? 'none'}.`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_orchestrator_gate',
    label: 'Answer Evidence Feedback Gate',
    description:
      'Persist the user’s explicit approve, revise, or reject decision',
    promptSnippet: 'Record an explicit human feedback decision',
    promptGuidelines: [
      'Use evidence_orchestrator_gate only when the user explicitly approves, revises, or rejects a pending Gate.',
    ],
    parameters: Type.Object({
      gateId: Type.String({ description: 'Pending Gate id.' }),
      decision: Type.String({
        description: 'Explicit approve/revise/reject decision and reason.',
      }),
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
