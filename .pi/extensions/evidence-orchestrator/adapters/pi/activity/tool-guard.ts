import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  ACTIVITY_CHILD_ENV,
  ACTIVITY_POLICY_ENV,
  activityToolDecision,
  readActivityToolPolicy,
} from '../../../capabilities/worktree-protection/activity-tool-policy';

export function registerActivityToolGuard(
  pi: ExtensionAPI,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment[ACTIVITY_CHILD_ENV] !== '1') return;

  let policy: ReturnType<typeof readActivityToolPolicy> | undefined;
  let policyError: string | undefined;
  try {
    const path = environment[ACTIVITY_POLICY_ENV];
    if (!path) throw new Error('Evidence activity policy path is missing.');
    policy = readActivityToolPolicy(path);
  } catch (error) {
    policyError = error instanceof Error ? error.message : String(error);
  }

  pi.on('tool_call', (event) => {
    if (!policy) {
      return {
        block: true,
        reason: `Evidence activity child is fail-closed: ${policyError ?? 'invalid policy'}`,
      };
    }
    const decision = activityToolDecision(policy, event.toolName, event.input);
    return decision.block
      ? { block: true, reason: decision.reason ?? 'Activity tool blocked.' }
      : undefined;
  });
}
