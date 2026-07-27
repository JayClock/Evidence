import type {
  DesktopPairDecisionAction,
  PairLocalReview,
  PairNextAction,
  PairResource,
} from '@evidence/api-client';
import { shortHash } from './delivery-authority-progress';

const approvalReturnRoutes: DesktopPairDecisionAction[] = [
  'back_implementation',
  'back_tasking',
  'cancel',
];

export function allowedPairRoute(
  pair: PairResource['data'],
  action: DesktopPairDecisionAction,
) {
  if (pair.run.status === 'approval_required') {
    return approvalReturnRoutes.includes(action);
  }
  return Boolean(
    pair.run.status === 'exception' &&
      pair.currentException?.allowedRoutes.includes(action),
  );
}

export function approvalPairReturnRoutes() {
  return approvalReturnRoutes;
}

export function reviewMatchesManifest(
  review: PairLocalReview,
  manifest: NonNullable<PairResource['data']['manifest']>,
) {
  const manifestPaths = new Set(manifest.changedPaths);
  return (
    review.manifestSha256 === manifest.contentSha256 &&
    review.diffSha256 === manifest.finalDiffSha256 &&
    review.changedFileCount === manifestPaths.size &&
    review.changedPaths.length === manifestPaths.size &&
    review.changedPaths.every((path) => manifestPaths.has(path))
  );
}

export function pairStepIndex(pair: PairResource['data']): number {
  const { status, checkpoint } = pair.run;
  if (status === 'approved') return 6;
  if (status === 'approval_required') return 4;
  if (status === 'exception') {
    if (pair.currentException?.kind === 'quality_gate_failed') return 3;
    if (pair.currentException?.kind === 'refactor_failed') return 2;
    if (
      ['unexpected_green', 'pseudo_red', 'green_failed'].includes(
        pair.currentException?.kind ?? '',
      )
    )
      return 1;
  }
  if (checkpoint === 'quality_gates_passed') return 4;
  if (checkpoint === 'quality_gate_failed' || checkpoint === 'refactored')
    return 3;
  if (
    [
      'test_written',
      'red_observed',
      'implementation_written',
      'green_observed',
    ].includes(checkpoint)
  )
    return 1;
  return 0;
}

export function nextActionTitle(action: PairNextAction | null): string {
  if (!action) return 'Pair 已结束，没有下一自动动作';
  switch (action.kind) {
    case 'run_driver':
      return `${driverRoleLabel(action.role)} · ${pairDecisionLabel(action.mode)}${action.workUnit ? ` · ${action.workUnit.test.id}` : ''}`;
    case 'execute_command':
      return `执行锁定 ${commandStageLabel(action.stage)} 命令`;
    case 'review_red':
      return `Independent Red Reviewer · ${action.workUnit.test.id}`;
    case 'await_human':
      return '等待 Story 级人工编码审批';
    case 'resolve_exception':
      return '等待人工选择 Server 允许的异常路由';
  }
}

export function commandObservationDetail(
  observation: PairResource['data']['commandObservations'][number],
) {
  return `exit ${observation.exitCode ?? 'none'} · ${observation.durationMs} ms · stdout ${shortHash(observation.stdoutSha256)} (${observation.stdoutBytes} bytes) · stderr ${shortHash(observation.stderrSha256)} (${observation.stderrBytes} bytes)`;
}

export function pairRequest(pair: PairResource['data'], id: string) {
  return {
    id,
    workspaceId: pair.run.workspaceId,
    iterationId: pair.run.iterationId,
  };
}

export function pairRequestId(): string {
  return `pair:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

export function pairStatusLabel(value: string): string {
  return statusLabels[value] ?? value;
}

export function pairCheckpointLabel(value: string): string {
  return checkpointLabels[value] ?? value;
}

export function pairExceptionLabel(value: string): string {
  return exceptionLabels[value] ?? value;
}

export function pairDecisionLabel(value: string): string {
  return decisionLabels[value] ?? value;
}

export function pairTitle(status: string): string {
  return (
    {
      running: 'Pair 执行中',
      exception: 'Pair 异常待决定',
      approval_required: 'Story 级编码审批',
      approved: 'Pair 已批准',
      cancelled: 'Pair 已取消',
    }[status] ?? 'Pair'
  );
}

export function pairDescription(status: string): string {
  if (status === 'approval_required')
    return '逐 TEST Red / Green、每工序一次 Refactor 与锁定质量门已完成。请核对有限证据和 Desktop 本地 Story Diff。';
  if (status === 'approved')
    return 'Manifest、最终 Diff 与本地 commit 已由人工决定锁定；Pair 到此停止，不自动 merge 或 push。';
  if (status === 'exception')
    return 'Pair 已 fail closed；完整诊断留在 Desktop，Server 只保存 observation、hash 与有限摘要。';
  if (status === 'cancelled')
    return 'Pair 已由人工取消，旧执行证据保持不可变。';
  return 'Controller 只执行 Server 发布的唯一 nextAction，并按 Approved Plan 逐 TEST 推进。';
}

export function pairAuthorityTitle(status: string): string {
  return (
    {
      running: '本地 Pair Controller',
      exception: '人工异常路由',
      approval_required: 'Story 级编码审批',
      approved: 'Pair Approved',
      cancelled: 'Pair Cancelled',
    }[status] ?? 'Pair authority'
  );
}

export function pairErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function commandStageLabel(value: string): string {
  return (
    {
      red: 'Red',
      green: 'Green',
      refactor: 'Refactor',
      quality_gate: '质量门',
    }[value] ?? value
  );
}

function driverRoleLabel(value: string): string {
  return (
    {
      test: 'Test Driver',
      production: 'Production Driver',
      refactor: 'Refactor Driver',
    }[value] ?? value
  );
}

const statusLabels: Record<string, string> = {
  running: '执行中',
  exception: '异常',
  approval_required: '等待审批',
  approved: '已批准',
  cancelled: '已取消',
  accepted: '已接受',
  rejected: '已拒绝',
  exited: '已退出',
  timed_out: '超时',
  signaled: '收到信号',
  spawn_error: '启动失败',
};

const checkpointLabels: Record<string, string> = {
  plan_confirmed: 'Plan 已确认',
  test_written: 'TEST 已写入',
  red_observed: 'Red 已观察',
  implementation_written: '实现已写入',
  green_observed: 'Green 已观察',
  refactored: 'Refactor 已完成',
  quality_gate_failed: '质量门失败',
  quality_gates_passed: '质量门已通过',
  approved: '编码已批准',
  exception: '异常待决定',
};

const exceptionLabels: Record<string, string> = {
  unexpected_green: '意外 Green',
  pseudo_red: '伪 Red',
  green_failed: 'Green 失败',
  refactor_failed: 'Refactor 失败',
  quality_gate_failed: '质量门失败',
  path_violation: '路径越界',
  git_head_changed: 'Git HEAD 已变化',
  project_ownership_changed: 'Project ownership 已变化',
  lease_expired: 'Lease 已过期',
  interrupted: '执行已中断',
  budget_exhausted: '预算耗尽',
  no_progress: '无进展',
  evidence_mismatch: '证据不匹配',
  runtime_failure: 'Runtime 失败',
};

const decisionLabels: Record<string, string> = {
  approve: '批准 Pair',
  back_test: '返回 TEST',
  back_implementation: '退回实现',
  back_tasking: '返回 Tasking',
  retry_quality: '重试质量门',
  cancel: '取消 Pair',
  write_test: '写入 TEST',
  repair_test: '修复 TEST',
  implement: '实现',
  repair_implementation: '修复实现',
  refactor: 'Refactor',
  repair_refactor: '修复 Refactor',
  repair_quality_gate: '修复质量门',
};
