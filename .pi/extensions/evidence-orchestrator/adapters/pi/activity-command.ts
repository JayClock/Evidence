import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
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

export function parseArgs(args: string): { dryRun: boolean; rest: string } {
  const parts = args.split(/\s+/).filter(Boolean);
  const rest = parts.filter((part) => part !== '--dry-run');
  return { dryRun: parts.includes('--dry-run'), rest: rest.join(' ') };
}
