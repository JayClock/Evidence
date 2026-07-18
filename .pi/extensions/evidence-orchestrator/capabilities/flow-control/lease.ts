import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  ACTIVITY_BOARD_ROOT_ENV,
  ACTIVITY_ITERATION_ENV,
  ACTIVITY_LEASE_ID_ENV,
} from '../worktree-protection/activity-tool-policy';
import { boardRoot, readBoard } from '../../iteration/board-repository';
import { primaryWorktreeRoot } from '../../iteration/git-common-dir';
import type { WorkflowState } from '../../iteration/state';
import { readState } from '../../iteration/state-repository';
import { workflowStateSha256 } from './admission';
import { readFlowPolicy } from './policy';

const LEASE_VERSION = 1;
const LEASE_ID_PATTERN = /^lease-[0-9a-f-]{36}$/;
const ITERATION_ID_PATTERN = /^ITER-\d{4,}$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export type ActivityLeaseKind = 'activity' | 'pair';

export interface ActivityLease {
  version: 1;
  lease_id: string;
  iteration_id: string;
  kind: ActivityLeaseKind;
  state_sha256: string;
  policy_sha256: string;
  owner_pid: number;
  acquired_at: string;
  expires_at: string;
}

export interface ActivityLeaseHandle {
  lease: ActivityLease;
  activityPath: string;
  pairSlotPath?: string;
}

export interface LeaseOptions {
  now?: () => Date;
  ownerPid?: number;
  leaseId?: () => string;
}

type LeaseEnvironment = Record<string, string | undefined>;

function leaseDirectory(cwd: string): string {
  return join(boardRoot(cwd), 'leases');
}

export function activityLeasePath(cwd: string, iterationId: string): string {
  return join(leaseDirectory(cwd), `${iterationId}.activity.json`);
}

function pairSlotPath(cwd: string, slot: number): string {
  return join(leaseDirectory(cwd), `pair-runner-${slot}.json`);
}

function leaseEventPath(cwd: string): string {
  return join(boardRoot(cwd), 'events.jsonl');
}

function fields(value: Record<string, unknown>): void {
  const expected = new Set([
    'version',
    'lease_id',
    'iteration_id',
    'kind',
    'state_sha256',
    'policy_sha256',
    'owner_pid',
    'acquired_at',
    'expires_at',
  ]);
  const unknown = Object.keys(value).filter((field) => !expected.has(field));
  const missing = [...expected].filter((field) => !Object.hasOwn(value, field));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error('Evidence activity lease fields are invalid.');
  }
}

function timestamp(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !value ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`Evidence activity lease ${field} is invalid.`);
  }
  return value;
}

function normalizeLease(value: unknown): ActivityLease {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Evidence activity lease must be an object.');
  }
  const lease = value as Record<string, unknown>;
  fields(lease);
  if (lease.version !== LEASE_VERSION) {
    throw new Error('Evidence activity lease version is unsupported.');
  }
  if (
    typeof lease.lease_id !== 'string' ||
    !LEASE_ID_PATTERN.test(lease.lease_id)
  ) {
    throw new Error('Evidence activity lease id is invalid.');
  }
  if (
    typeof lease.iteration_id !== 'string' ||
    !ITERATION_ID_PATTERN.test(lease.iteration_id)
  ) {
    throw new Error('Evidence activity lease Iteration id is invalid.');
  }
  if (lease.kind !== 'activity' && lease.kind !== 'pair') {
    throw new Error('Evidence activity lease kind is invalid.');
  }
  if (
    typeof lease.state_sha256 !== 'string' ||
    !SHA256_PATTERN.test(lease.state_sha256)
  ) {
    throw new Error('Evidence activity lease State hash is invalid.');
  }
  if (
    typeof lease.policy_sha256 !== 'string' ||
    !SHA256_PATTERN.test(lease.policy_sha256)
  ) {
    throw new Error('Evidence activity lease policy hash is invalid.');
  }
  if (!Number.isSafeInteger(lease.owner_pid) || Number(lease.owner_pid) <= 0) {
    throw new Error('Evidence activity lease owner pid is invalid.');
  }
  const acquiredAt = timestamp(lease.acquired_at, 'acquired_at');
  const expiresAt = timestamp(lease.expires_at, 'expires_at');
  if (Date.parse(expiresAt) <= Date.parse(acquiredAt)) {
    throw new Error('Evidence activity lease expiry is invalid.');
  }
  return {
    version: LEASE_VERSION,
    lease_id: lease.lease_id,
    iteration_id: lease.iteration_id,
    kind: lease.kind,
    state_sha256: lease.state_sha256,
    policy_sha256: lease.policy_sha256,
    owner_pid: Number(lease.owner_pid),
    acquired_at: acquiredAt,
    expires_at: expiresAt,
  };
}

function readLease(path: string): ActivityLease {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`Evidence activity lease is unreadable: ${path}.`);
  }
  return normalizeLease(value);
}

function writeExclusive(path: string, lease: ActivityLease): boolean {
  mkdirSync(dirname(path), { recursive: true });
  let descriptor: number;
  try {
    descriptor = openSync(path, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify(lease, null, 2)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return true;
}

function replaceLease(path: string, lease: ActivityLease): void {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(lease, null, 2)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, path);
}

function remove(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function assertLeaseContext(
  cwd: string,
  worktreeRoot: string,
  state: WorkflowState,
  kind: ActivityLeaseKind,
): string {
  const primaryRoot = primaryWorktreeRoot(cwd);
  const item = readBoard(primaryRoot).items.find(
    ({ iteration_id }) => iteration_id === state.iteration_id,
  );
  if (!item || item.lifecycle !== 'active') {
    throw new Error(`Story is not active on the Board: ${state.iteration_id}.`);
  }
  const canonicalWorktree = realpathSync(worktreeRoot);
  if (realpathSync(item.worktree_path) !== canonicalWorktree) {
    throw new Error(`Board worktree mismatch for ${state.iteration_id}.`);
  }
  const persisted = readState(canonicalWorktree);
  if (persisted.iteration_id !== state.iteration_id) {
    throw new Error(`Story State identity drifted for ${state.iteration_id}.`);
  }
  if (workflowStateSha256(persisted) !== workflowStateSha256(state)) {
    throw new Error(
      `Story State changed before lease acquisition: ${state.iteration_id}.`,
    );
  }
  if (kind === 'pair' && item.admitted_lane !== 'delivery') {
    throw new Error(
      `${state.iteration_id} must be admitted to Delivery before acquiring the Pair runner.`,
    );
  }
  return primaryRoot;
}

function occupiedMessage(path: string, now: Date): string {
  const existing = readLease(path);
  const status =
    Date.parse(existing.expires_at) <= now.getTime()
      ? 'expired and requires explicit recovery'
      : 'already held';
  return `${existing.iteration_id} activity lease is ${status}.`;
}

function acquirePairSlot(
  primaryRoot: string,
  lease: ActivityLease,
  capacity: number,
  now: Date,
): string {
  let expired = false;
  for (let slot = 1; slot <= capacity; slot += 1) {
    const path = pairSlotPath(primaryRoot, slot);
    if (writeExclusive(path, lease)) return path;
    const existing = readLease(path);
    if (Date.parse(existing.expires_at) <= now.getTime()) expired = true;
  }
  throw new Error(
    expired
      ? 'Pair runner lease capacity includes an expired lease; explicit recovery is required.'
      : 'Pair runner lease capacity is exhausted.',
  );
}

export function acquireActivityLease(
  cwd: string,
  worktreeRoot: string,
  state: WorkflowState,
  kind: ActivityLeaseKind,
  options: LeaseOptions = {},
): ActivityLeaseHandle {
  const primaryRoot = assertLeaseContext(cwd, worktreeRoot, state, kind);
  const policy = readFlowPolicy(primaryRoot);
  const now = (options.now ?? (() => new Date()))();
  const ownerPid = options.ownerPid ?? process.pid;
  const leaseId = `lease-${(options.leaseId ?? randomUUID)()}`;
  const lease: ActivityLease = normalizeLease({
    version: LEASE_VERSION,
    lease_id: leaseId,
    iteration_id: state.iteration_id,
    kind,
    state_sha256: workflowStateSha256(state),
    policy_sha256: policy.sha256,
    owner_pid: ownerPid,
    acquired_at: now.toISOString(),
    expires_at: new Date(
      now.getTime() + policy.policy.lease_timeout_ms,
    ).toISOString(),
  });
  const activityPath = activityLeasePath(primaryRoot, state.iteration_id);
  if (!writeExclusive(activityPath, lease)) {
    throw new Error(occupiedMessage(activityPath, now));
  }
  try {
    const pairSlot =
      kind === 'pair'
        ? acquirePairSlot(
            primaryRoot,
            lease,
            policy.policy.resources.pair_runner,
            now,
          )
        : undefined;
    return {
      lease,
      activityPath,
      ...(pairSlot ? { pairSlotPath: pairSlot } : {}),
    };
  } catch (error) {
    remove(activityPath);
    throw error;
  }
}

export function advanceActivityLeaseState(
  handle: ActivityLeaseHandle,
  state: WorkflowState,
): void {
  const current = readLease(handle.activityPath);
  if (current.lease_id !== handle.lease.lease_id) {
    throw new Error('Activity lease ownership changed before State advance.');
  }
  if (state.iteration_id !== current.iteration_id) {
    throw new Error('Activity lease cannot advance another Iteration State.');
  }
  const advanced = normalizeLease({
    ...current,
    state_sha256: workflowStateSha256(state),
  });
  replaceLease(handle.activityPath, advanced);
  handle.lease = advanced;
}

export function releaseActivityLease(handle: ActivityLeaseHandle): void {
  const current = readLease(handle.activityPath);
  if (current.lease_id !== handle.lease.lease_id) {
    throw new Error('Refusing to release an activity lease owned elsewhere.');
  }
  if (handle.pairSlotPath) {
    const pair = readLease(handle.pairSlotPath);
    if (pair.lease_id !== handle.lease.lease_id) {
      throw new Error(
        'Refusing to release a Pair runner lease owned elsewhere.',
      );
    }
    remove(handle.pairSlotPath);
  }
  remove(handle.activityPath);
}

export function assertActivityMutationLease(
  cwd: string,
  worktreeRoot: string,
  state: WorkflowState,
  environment: LeaseEnvironment = process.env,
  now = new Date(),
): ActivityLease {
  const iterationId = environment[ACTIVITY_ITERATION_ENV]?.trim().toUpperCase();
  const leaseId = environment[ACTIVITY_LEASE_ID_ENV]?.trim();
  const expectedBoardRoot = environment[ACTIVITY_BOARD_ROOT_ENV]?.trim();
  if (!iterationId || !leaseId || !expectedBoardRoot) {
    throw new Error('Story mutation requires a bound activity lease.');
  }
  if (iterationId !== state.iteration_id) {
    throw new Error(
      `Activity lease is bound to ${iterationId}, not ${state.iteration_id}.`,
    );
  }
  const primaryRoot = assertLeaseContext(cwd, worktreeRoot, state, 'activity');
  if (resolve(expectedBoardRoot) !== resolve(boardRoot(primaryRoot))) {
    throw new Error(`Activity Board root binding drifted for ${iterationId}.`);
  }
  const lease = readLease(activityLeasePath(primaryRoot, iterationId));
  if (lease.lease_id !== leaseId) {
    throw new Error(`Activity lease id mismatch for ${iterationId}.`);
  }
  if (Date.parse(lease.expires_at) <= now.getTime()) {
    throw new Error(
      `${iterationId} activity lease expired; explicit recovery is required.`,
    );
  }
  if (lease.state_sha256 !== workflowStateSha256(state)) {
    throw new Error(`Activity lease State CAS failed for ${iterationId}.`);
  }
  return lease;
}

function appendRecoveryEvent(
  cwd: string,
  lease: ActivityLease,
  reason: string,
  recoveredAt: string,
): void {
  const path = leaseEventPath(cwd);
  mkdirSync(boardRoot(cwd), { recursive: true });
  const descriptor = openSync(path, 'a', 0o600);
  try {
    writeFileSync(
      descriptor,
      `${JSON.stringify({
        version: 1,
        type: 'lease_recovered',
        iteration_id: lease.iteration_id,
        lease_id: lease.lease_id,
        kind: lease.kind,
        reason,
        recovered_at: recoveredAt,
      })}\n`,
    );
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function recoverExpiredActivityLease(
  cwd: string,
  iterationId: string,
  reason: string,
  now = new Date(),
): ActivityLease {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error('Lease recovery requires a human reason.');
  }
  const primaryRoot = primaryWorktreeRoot(cwd);
  const path = activityLeasePath(primaryRoot, iterationId);
  if (!existsSync(path)) {
    throw new Error(`No activity lease exists for ${iterationId}.`);
  }
  const lease = readLease(path);
  if (Date.parse(lease.expires_at) > now.getTime()) {
    throw new Error(`Activity lease is still active for ${iterationId}.`);
  }
  for (const entry of existsSync(leaseDirectory(primaryRoot))
    ? readdirSync(leaseDirectory(primaryRoot))
    : []) {
    if (!/^pair-runner-\d+\.json$/.test(entry)) continue;
    const pairPath = join(leaseDirectory(primaryRoot), entry);
    if (readLease(pairPath).lease_id === lease.lease_id) remove(pairPath);
  }
  remove(path);
  appendRecoveryEvent(primaryRoot, lease, normalizedReason, now.toISOString());
  return lease;
}
