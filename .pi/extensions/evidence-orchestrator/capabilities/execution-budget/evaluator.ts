import { createHash } from 'node:crypto';
import type { TestExecutionRecord } from '../execution-evidence/observation-log';
import type {
  PairDriverMode,
  PairProgressMarker,
  WorkflowState,
} from '../../iteration/state';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function commandFailureFingerprint(input: {
  record: Pick<
    TestExecutionRecord,
    | 'stage'
    | 'command'
    | 'exit_code'
    | 'termination'
    | 'stdout_sha256'
    | 'stderr_sha256'
  >;
  failureKind: string;
  currentTest: string;
  changedDiffSha256: string;
}): string {
  return digest(
    JSON.stringify({
      stage: input.record.stage,
      command: input.record.command,
      exit_or_termination: input.record.termination,
      exit_code: input.record.exit_code,
      stdout_sha256: input.record.stdout_sha256,
      stderr_sha256: input.record.stderr_sha256,
      failure_kind: input.failureKind,
      current_test: input.currentTest,
      changed_diff_sha256: input.changedDiffSha256,
    }),
  );
}

export function driverFailureFingerprint(input: {
  mode: PairDriverMode | 'red-reviewer';
  taskId: string;
  testId: string;
  blockedReason: string;
  changedPaths: string[];
  output: string;
}): string {
  return digest(
    JSON.stringify({
      mode: input.mode,
      task: input.taskId,
      test: input.testId,
      blocked_reason: input.blockedReason,
      changed_paths: [...new Set(input.changedPaths)].sort(),
      output_sha256: digest(input.output),
    }),
  );
}

const CHECKPOINT_RANK: Record<
  NonNullable<WorkflowState['pair_session']>['checkpoint'],
  number
> = {
  plan_confirmed: 0,
  test_written: 1,
  red_observed: 2,
  implementation_written: 4,
  green_observed: 5,
  refactored: 6,
  quality_gate_failed: 6,
  quality_gates_passed: 7,
};

export function pairProgressMarker(state: WorkflowState): PairProgressMarker {
  const session = state.pair_session;
  const candidate = state.tasking_candidate;
  if (!session || !candidate) {
    throw new Error('Pair progress requires an approved Pair session.');
  }
  const orderedTestIds = candidate.tasks.flatMap(({ test_ids }) => test_ids);
  const currentWorkUnitIndex = orderedTestIds.indexOf(session.test_id);
  if (currentWorkUnitIndex < 0) {
    throw new Error(`Pair progress cannot locate ${session.test_id}.`);
  }
  const acceptedBehavior =
    session.checkpoint === 'red_observed' &&
    session.red_observation?.accepted === true;
  return {
    completed_test_count: session.completed_test_ids.length,
    completed_step_count: session.completed_step_ids.length,
    quality_gate_index: session.quality_gate_index,
    current_work_unit_index: currentWorkUnitIndex,
    checkpoint_rank:
      CHECKPOINT_RANK[session.checkpoint] + (acceptedBehavior ? 1 : 0),
  };
}

/** Compare irreversible milestones first; rank may reset when the TEST index advances. */
export function pairProgressAdvanced(
  previous: PairProgressMarker,
  current: PairProgressMarker,
): boolean {
  for (const field of [
    'completed_test_count',
    'completed_step_count',
    'quality_gate_index',
    'current_work_unit_index',
    'checkpoint_rank',
  ] as const) {
    if (current[field] > previous[field]) return true;
    if (current[field] < previous[field]) return false;
  }
  return false;
}
