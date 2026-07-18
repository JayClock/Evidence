import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FlowPolicy, FlowPolicySnapshot } from './model';

export const FLOW_POLICY_PATH =
  'engineering/evidence-orchestrator/flow-policy.json';

const POLICY_FIELDS = new Set([
  'max_active_stories',
  'lanes',
  'resources',
  'lease_timeout_ms',
]);
const LANE_FIELDS = new Set([
  'discovery',
  'planning',
  'ready',
  'delivery',
  'review',
]);
const RESOURCE_FIELDS = new Set(['pair_runner', 'activity_per_story']);

function record(value: unknown, subject: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function fields(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
  subject: string,
): void {
  const actual = Object.keys(value);
  const missing = [...expected].filter((field) => !Object.hasOwn(value, field));
  const unknown = actual.filter((field) => !expected.has(field));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `${subject} fields are invalid${missing.length ? `; missing ${missing.join(', ')}` : ''}${unknown.length ? `; unsupported ${unknown.join(', ')}` : ''}.`,
    );
  }
}

function positiveInteger(value: unknown, subject: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${subject} must be a positive integer.`);
  }
  return Number(value);
}

export function normalizeFlowPolicy(value: unknown): FlowPolicy {
  const policy = record(value, 'Flow policy');
  fields(policy, POLICY_FIELDS, 'Flow policy');
  const lanes = record(policy.lanes, 'Flow policy lanes');
  const resources = record(policy.resources, 'Flow policy resources');
  fields(lanes, LANE_FIELDS, 'Flow policy lanes');
  fields(resources, RESOURCE_FIELDS, 'Flow policy resources');
  return {
    max_active_stories: positiveInteger(
      policy.max_active_stories,
      'Flow policy max_active_stories',
    ),
    lanes: {
      discovery: positiveInteger(lanes.discovery, 'Flow policy discovery WIP'),
      planning: positiveInteger(lanes.planning, 'Flow policy planning WIP'),
      ready: positiveInteger(lanes.ready, 'Flow policy ready WIP'),
      delivery: positiveInteger(lanes.delivery, 'Flow policy delivery WIP'),
      review: positiveInteger(lanes.review, 'Flow policy review WIP'),
    },
    resources: {
      pair_runner: positiveInteger(
        resources.pair_runner,
        'Flow policy pair_runner',
      ),
      activity_per_story: positiveInteger(
        resources.activity_per_story,
        'Flow policy activity_per_story',
      ),
    },
    lease_timeout_ms: positiveInteger(
      policy.lease_timeout_ms,
      'Flow policy lease_timeout_ms',
    ),
  };
}

export function readFlowPolicy(cwd: string): FlowPolicySnapshot {
  const path = join(cwd, FLOW_POLICY_PATH);
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Flow policy is missing: ${FLOW_POLICY_PATH}.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new Error(`Flow policy is invalid JSON: ${FLOW_POLICY_PATH}.`);
  }
  return {
    path: FLOW_POLICY_PATH,
    sha256: `sha256:${createHash('sha256').update(content).digest('hex')}`,
    policy: normalizeFlowPolicy(value),
  };
}
