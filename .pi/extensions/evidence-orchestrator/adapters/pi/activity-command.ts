import { rmSync } from 'node:fs';
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import {
  captureWorktreeSnapshot,
  restoreWorktreeSnapshot,
  worktreeDelta,
} from '../../capabilities/worktree-protection/snapshot';
import {
  changeExplanationTaskWithBundle,
  createHtmlChangeAnalysisBundle,
  prepareHtmlChangeExplanation,
  recordHtmlChangeExplanation,
} from '../../loops/pair/change-explanation';
import { createActivityToolPolicy } from '../../capabilities/worktree-protection/activity-tool-policy';
import {
  isActivityAgentFailure,
  loadActivityAgent,
  runActivityAgent,
  type ActivityAgentResult,
} from '../node/activity-agent-process';
import { activityTraceRelativePath } from '../../capabilities/activity-observability/trace';
import { artifactRelativePath } from '../../iteration/artifact-layout';
import {
  readPersistedState,
  readState,
} from '../../iteration/state-repository';
import {
  ACTIVITY_RESULT_ENTRY_TYPE,
  ACTIVITY_RESULT_MESSAGE_TYPE,
} from './identity';
import type { PreparedActivityRun } from './activity/dispatch';
import {
  executePreparedActivityRun,
  type ActivityExecutionDetails,
} from './activity/execution';
import {
  boundedModelVisibleActivityText,
  createActivityResultEntryData,
} from './activity/activity-agent-renderer';
import { runWithActivityProgress } from './activity/progress';
import { taskWithContextCapsule } from './activity/task';
import { withActivityTrace } from './activity/trace';
import { nextStepGuidance } from './next-step';

function activityResultReferences(
  cwd: string,
  extra: readonly string[] = [],
): string[] {
  const state = readPersistedState(cwd);
  return [
    ...(state
      ? [
          activityTraceRelativePath(state.iteration_id),
          state.approved_test_plan_path,
          state.model_expansion_path,
          state.pair_session?.coding_decision?.execution_manifest_path,
        ]
      : []),
    ...extra,
  ].filter(
    (reference, index, references): reference is string =>
      Boolean(reference) && references.indexOf(reference) === index,
  );
}

export function publishActivityCommandResult(
  pi: ExtensionAPI,
  cwd: string,
  details: ActivityExecutionDetails,
  extraReferences: readonly string[] = [],
): 'entry' | 'tqa-message' | 'failure-message' {
  const state = readPersistedState(cwd);
  const references = activityResultReferences(cwd, extraReferences);
  const pending = state?.pending_clarification;
  if (
    details.status === 'completed' &&
    details.activity === 'understand' &&
    pending
  ) {
    const content = boundedModelVisibleActivityText(
      `TQA ${pending.question_id} · ${pending.story_id}\n\n${pending.question}\n\n请直接回复此问题。`,
      references,
      { preserveWholeText: true },
    );
    pi.sendMessage({
      customType: ACTIVITY_RESULT_MESSAGE_TYPE,
      content,
      display: true,
      details,
    });
    return 'tqa-message';
  }
  if (details.status === 'failed') {
    const next = state ? nextStepGuidance(cwd, state) : '/evidence-status';
    const content = boundedModelVisibleActivityText(
      `Evidence ${details.activity} activity requires human exception routing.\n\n${details.output}\n\nNext: ${next}`,
      references,
    );
    pi.sendMessage({
      customType: ACTIVITY_RESULT_MESSAGE_TYPE,
      content,
      display: true,
      details,
    });
    return 'failure-message';
  }
  pi.appendEntry(
    ACTIVITY_RESULT_ENTRY_TYPE,
    createActivityResultEntryData(details, references),
  );
  return 'entry';
}

export async function runPreparedActivityFromCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  preparation: PreparedActivityRun,
  invocation: string,
): Promise<ActivityExecutionDetails | undefined> {
  const details = await runWithActivityProgress(
    ctx,
    `Running Evidence ${preparation.activity} activity…`,
    (signal, onUpdate) =>
      executePreparedActivityRun(ctx, preparation, {
        invocation,
        signal,
        onUpdate,
      }),
  );
  if (!details) {
    ctx.ui.notify(
      `Evidence ${preparation.activity} activity execution cancelled.`,
      'info',
    );
    return undefined;
  }
  publishActivityCommandResult(pi, ctx.cwd, details);
  if (details.status === 'failed') {
    ctx.ui.notify(
      `Evidence ${details.activity} activity failed with exit ${details.exitCode}.`,
      'error',
    );
  }
  return details;
}

export async function runHtmlChangeExplanationFromCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<ActivityExecutionDetails | undefined> {
  const request = prepareHtmlChangeExplanation(ctx.cwd);
  const snapshot = captureWorktreeSnapshot(ctx.cwd);
  const bundle = createHtmlChangeAnalysisBundle(ctx.cwd, request);
  let recorded = false;
  let details: ActivityExecutionDetails | undefined;
  try {
    const traceState = readState(ctx.cwd);
    const exactArtifactPath = (path: string) =>
      path.startsWith(`artifacts/iterations/${traceState.iteration_id}/`)
        ? path
        : artifactRelativePath(traceState, path);
    const modelingDecision =
      traceState.modeling_profile?.method === 'none'
        ? traceState.model_expansion_path
        : traceState.model_decisions?.at(-1)?.artifact_path;
    const task = taskWithContextCapsule(
      {
        identity: [
          `iteration_id=${traceState.iteration_id}`,
          `story_id=${request.story_id}`,
          `scenario_ids=${request.scenario_ids.join(',')}`,
        ],
        decision: [
          'loop=pair',
          'stage=change_explanation',
          `checkpoint=${traceState.pair_session?.checkpoint ?? 'missing'}`,
          'requested_outcome=return one self-contained HTML explanation of the stable Story diff',
        ],
        authority: [
          `git_baseline=${request.git_baseline}`,
          `git_head=${request.git_head}`,
          `code_content_sha256=${request.code_content_sha256}`,
          `execution_manifest_sha256=${request.execution_manifest_sha256}`,
          ...(traceState.approved_test_plan_sha256
            ? [
                `approved_test_plan_sha256=${traceState.approved_test_plan_sha256}`,
              ]
            : []),
        ],
        inputs: [
          '.pi/skills/evidence-change-explanation/SKILL.md',
          ...(traceState.confirmed_scenarios ?? []).map(({ artifact_path }) =>
            exactArtifactPath(artifact_path),
          ),
          ...(traceState.model_expansion_path
            ? [exactArtifactPath(traceState.model_expansion_path)]
            : []),
          ...(modelingDecision ? [exactArtifactPath(modelingDecision)] : []),
          ...(traceState.approved_test_plan_path
            ? [exactArtifactPath(traceState.approved_test_plan_path)]
            : []),
          exactArtifactPath(request.execution_manifest_path),
          exactArtifactPath(request.execution_summary_path),
          bundle.diff_path,
          bundle.status_path,
        ],
        work_unit: [
          `story_id=${request.story_id}`,
          `scenario_ids=${request.scenario_ids.join(',')}`,
        ],
        boundaries: [
          'role=change-explainer',
          'tools=read',
          `read_roots=repository root,${bundle.directory}`,
          'write_mode=none',
          'write_roots=none',
          'forbidden=Bash, writes, tests, quality gates, Git mutation, approval, product-value claims',
        ],
        output: [
          'exact schema: one complete HTML document from <!doctype html> through </html>',
          'stop after returning the HTML; controller validates and writes it outside the repository',
        ],
      },
      changeExplanationTaskWithBundle(request, bundle),
    );
    const traceAgent = loadActivityAgent(ctx.cwd, 'change-explainer');
    details = await runWithActivityProgress(
      ctx,
      `Explaining ${request.story_id} as self-contained HTML…`,
      async (signal, onUpdate) => {
        let agentResult: ActivityAgentResult | undefined;
        return withActivityTrace(
          ctx.cwd,
          {
            state: traceState,
            activity: 'pair',
            task,
            agent: traceAgent.name,
            requestedModel: traceAgent.model,
            thinking: traceAgent.thinking,
            sessionMode: 'ephemeral',
            toolNames: [...(traceAgent.tools ?? [])],
          },
          async () => {
            try {
              const result = await runActivityAgent({
                cwd: ctx.cwd,
                agentName: 'change-explainer',
                task,
                policy: createActivityToolPolicy({
                  cwd: ctx.cwd,
                  role: 'change-explainer',
                  extraReadRoots: [bundle.directory],
                }),
                signal,
                onUpdate(progress) {
                  onUpdate({
                    ...progress,
                    activity: 'pair',
                    task,
                    status: 'running',
                  });
                },
              });
              agentResult = result;
              if (isActivityAgentFailure(result)) {
                throw new Error(result.output);
              }
              const delta = worktreeDelta(ctx.cwd, snapshot);
              if (
                delta.headChanged ||
                delta.indexChanged ||
                delta.paths.length > 0
              ) {
                restoreWorktreeSnapshot(ctx.cwd, snapshot);
                throw new Error(
                  `Change Explainer crossed its read-only repository boundary: ${delta.paths.join(', ') || 'Git metadata changed'}. Restored the Pair worktree.`,
                );
              }
              const record = recordHtmlChangeExplanation(
                ctx.cwd,
                request,
                result.output,
              );
              recorded = true;
              const toolCallMessages = result.messages.flatMap((message) =>
                message.role === 'assistant'
                  ? [
                      {
                        ...message,
                        content: message.content.filter(
                          (part) => part.type === 'toolCall',
                        ),
                      },
                    ]
                  : [],
              );
              return {
                ...result,
                messages: toolCallMessages,
                activity: 'pair' as const,
                task,
                status: 'completed' as const,
                output: `HTML change explanation generated for ${record.story_id}.\n\nFile: ${record.output_path}\nMetadata: ${record.artifact_path}\nHTML SHA256: ${record.html_sha256}\n\nThis is an optional, non-authoritative review aid. Human Story-level coding approval is still required.`,
              };
            } finally {
              if (!recorded) {
                const delta = worktreeDelta(ctx.cwd, snapshot);
                if (
                  delta.headChanged ||
                  delta.indexChanged ||
                  delta.paths.length > 0
                ) {
                  restoreWorktreeSnapshot(ctx.cwd, snapshot);
                }
                rmSync(request.output_path, { force: true });
              }
            }
          },
          {
            signal,
            partialResult: () => agentResult,
            resultForTrace: (value) => agentResult ?? value,
            resultingState: () => readState(ctx.cwd),
          },
        );
      },
    );
  } finally {
    rmSync(bundle.directory, { recursive: true, force: true });
  }
  if (!details) {
    ctx.ui.notify('HTML change explanation cancelled.', 'info');
    return undefined;
  }
  publishActivityCommandResult(pi, ctx.cwd, details, [
    request.output_path,
    request.metadata_path,
  ]);
  return details;
}

export function parseArgs(args: string): { dryRun: boolean; rest: string } {
  const parts = args.split(/\s+/).filter(Boolean);
  const rest = parts.filter((part) => part !== '--dry-run');
  return { dryRun: parts.includes('--dry-run'), rest: rest.join(' ') };
}
