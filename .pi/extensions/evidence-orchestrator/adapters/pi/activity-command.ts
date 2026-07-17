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
  prepareHtmlChangeExplanation,
  recordHtmlChangeExplanation,
} from '../../loops/pair/change-explanation';
import { runActivityAgent } from '../node/activity-agent-process';
import { ACTIVITY_RESULT_MESSAGE_TYPE } from './identity';
import type { PreparedActivityRun } from './activity/dispatch';
import {
  executePreparedActivityRun,
  type ActivityExecutionDetails,
} from './activity/execution';
import { runWithActivityProgress } from './activity/progress';

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
  pi.sendMessage({
    customType: ACTIVITY_RESULT_MESSAGE_TYPE,
    content: details.output,
    display: true,
    details,
  });
  if (details.exitCode !== 0) {
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
  let recorded = false;
  const details = await runWithActivityProgress(
    ctx,
    `Explaining ${request.story_id} as self-contained HTML…`,
    async (signal, onUpdate) => {
      try {
        const result = await runActivityAgent({
          cwd: ctx.cwd,
          agentName: 'change-explainer',
          task: request.task,
          signal,
          onUpdate(progress) {
            onUpdate({
              ...progress,
              activity: 'pair',
              task: request.task,
              status: 'running',
            });
          },
        });
        if (result.exitCode !== 0) {
          throw new Error(result.output);
        }
        const delta = worktreeDelta(ctx.cwd, snapshot);
        if (delta.headChanged || delta.indexChanged || delta.paths.length > 0) {
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
          activity: 'pair',
          task: request.task,
          status: 'completed',
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
  );
  if (!details) {
    ctx.ui.notify('HTML change explanation cancelled.', 'info');
    return undefined;
  }
  pi.sendMessage({
    customType: ACTIVITY_RESULT_MESSAGE_TYPE,
    content: details.output,
    display: true,
    details,
  });
  return details;
}

export function parseArgs(args: string): { dryRun: boolean; rest: string } {
  const parts = args.split(/\s+/).filter(Boolean);
  const rest = parts.filter((part) => part !== '--dry-run');
  return { dryRun: parts.includes('--dry-run'), rest: rest.join(' ') };
}
