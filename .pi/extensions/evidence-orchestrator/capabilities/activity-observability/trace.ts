import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  iterationRoot,
  iterationRootRelative,
} from '../../iteration/artifact-layout';
import type { WorkflowLoop } from '../../iteration/state';
import type { ActivityUsage } from './activity-usage';

export type TraceableActivity = Exclude<WorkflowLoop, 'complete'> | 'inbox';
export type ActivityTraceStatus =
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'timeout';
export type ActivityTraceSessionMode =
  | 'ephemeral'
  | 'persistent'
  | 'deterministic';

export interface ActivityTraceEvent {
  version: 1;
  sequence: number;
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  event: 'activity_started' | 'activity_finished';
  activity: TraceableActivity;
  checkpoint?: string;
  story_id?: string;
  task_id?: string;
  test_id?: string;
  process_id?: string;
  step_id?: string;
  agent: string;
  /** The model in effect for this event; actual model on finish. */
  model: string;
  requested_model: string;
  actual_model: string;
  thinking: string;
  session_mode: ActivityTraceSessionMode;
  task_sha256: string;
  tool_names: string[];
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  status?: ActivityTraceStatus;
  exit_code?: number;
  stop_reason?: string;
  error_message_sha256?: string;
  output_sha256?: string;
  usage?: ActivityUsage;
  tool_call_counts?: Record<string, number>;
  execution_record_sequences?: number[];
  resulting_checkpoint?: string;
  previous_record_sha256: string;
  record_sha256: string;
}

export interface ActivityTraceStartInput {
  iterationId: string;
  parentSpanId?: string;
  activity: TraceableActivity;
  checkpoint?: string;
  storyId?: string;
  taskId?: string;
  testId?: string;
  processId?: string;
  stepId?: string;
  agent: string;
  requestedModel: string;
  thinking: string;
  sessionMode: ActivityTraceSessionMode;
  task: string;
  toolNames: string[];
  startedAt?: string;
}

export interface ActivityTraceSpan {
  traceId: string;
  spanId: string;
  path: string;
  started: ActivityTraceEvent;
}

export interface ActivityTraceFinishInput {
  status: ActivityTraceStatus;
  actualModel?: string;
  completedAt?: string;
  durationMs?: number;
  exitCode?: number;
  stopReason?: string;
  errorMessage?: string;
  output?: string;
  usage: ActivityUsage;
  toolCallCounts: Record<string, number>;
  executionRecordSequences?: number[];
  resultingCheckpoint?: string;
}

const SHA256 = /^[0-9a-f]{64}$/;
const SPAN_ID = /^ACT-\d{6,}$/;
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
// Trace identity fields must stay single-line and free of JSON control bytes.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const ACTIVITIES = new Set<TraceableActivity>([
  'inbox',
  'kickoff',
  'understand',
  'tasking',
  'pair',
  'showcase',
  'respond',
]);
const SESSION_MODES = new Set<ActivityTraceSessionMode>([
  'ephemeral',
  'persistent',
  'deterministic',
]);
const THINKING_LEVELS = new Set([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);
const STATUSES = new Set<ActivityTraceStatus>([
  'completed',
  'failed',
  'aborted',
  'timeout',
]);
const EVENT_KEYS = new Set<keyof ActivityTraceEvent>([
  'version',
  'sequence',
  'trace_id',
  'span_id',
  'parent_span_id',
  'event',
  'activity',
  'checkpoint',
  'story_id',
  'task_id',
  'test_id',
  'process_id',
  'step_id',
  'agent',
  'model',
  'requested_model',
  'actual_model',
  'thinking',
  'session_mode',
  'task_sha256',
  'tool_names',
  'started_at',
  'completed_at',
  'duration_ms',
  'status',
  'exit_code',
  'stop_reason',
  'error_message_sha256',
  'output_sha256',
  'usage',
  'tool_call_counts',
  'execution_record_sequences',
  'resulting_checkpoint',
  'previous_record_sha256',
  'record_sha256',
]);

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function unsignedRecordSha256(record: ActivityTraceEvent): string {
  const { record_sha256: ignored, ...unsigned } = record;
  void ignored;
  return digest(JSON.stringify(unsigned));
}

function record(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function boundedString(
  value: unknown,
  subject: string,
  options: { optional?: boolean; max?: number } = {},
): string | undefined {
  if (value === undefined && options.optional) return undefined;
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > (options.max ?? 512) ||
    CONTROL_CHARACTER.test(value)
  ) {
    throw new Error(`${subject} must be a bounded non-empty string.`);
  }
  return value;
}

function timestamp(value: unknown, subject: string): string {
  const parsed = boundedString(value, subject, { max: 64 });
  if (
    !parsed ||
    !RFC3339.test(parsed) ||
    !Number.isFinite(Date.parse(parsed))
  ) {
    throw new Error(`${subject} must be an RFC 3339 timestamp.`);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, subject: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${subject} must be a non-negative integer.`);
  }
  return value as number;
}

function finiteNonNegative(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${subject} must be a finite non-negative number.`);
  }
  return value;
}

function validateUsage(value: unknown, subject: string): ActivityUsage {
  const candidate = record(value, subject);
  const expected = new Set([
    'turns',
    'input_tokens',
    'output_tokens',
    'cache_read_tokens',
    'cache_write_tokens',
    'cost_usd',
    'context_tokens_at_end',
  ]);
  for (const key of Object.keys(candidate)) {
    if (!expected.has(key)) throw new Error(`${subject}.${key} is unknown.`);
  }
  const cost = candidate.cost_usd;
  const context = candidate.context_tokens_at_end;
  return {
    turns: nonNegativeInteger(candidate.turns, `${subject}.turns`),
    input_tokens: nonNegativeInteger(
      candidate.input_tokens,
      `${subject}.input_tokens`,
    ),
    output_tokens: nonNegativeInteger(
      candidate.output_tokens,
      `${subject}.output_tokens`,
    ),
    cache_read_tokens: nonNegativeInteger(
      candidate.cache_read_tokens,
      `${subject}.cache_read_tokens`,
    ),
    cache_write_tokens: nonNegativeInteger(
      candidate.cache_write_tokens,
      `${subject}.cache_write_tokens`,
    ),
    cost_usd:
      cost === null ? null : finiteNonNegative(cost, `${subject}.cost_usd`),
    context_tokens_at_end:
      context === null
        ? null
        : nonNegativeInteger(context, `${subject}.context_tokens_at_end`),
  };
}

function validateCountMap(
  value: unknown,
  subject: string,
): Record<string, number> {
  const candidate = record(value, subject);
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(candidate)) {
    const name = boundedString(key, `${subject} key`, { max: 128 });
    if (!name) throw new Error(`${subject} has an invalid key.`);
    result[name] = nonNegativeInteger(count, `${subject}.${name}`);
  }
  return result;
}

function validateStringArray(value: unknown, subject: string): string[] {
  if (!Array.isArray(value) || value.length > 128) {
    throw new Error(`${subject} must be a bounded string array.`);
  }
  const strings = value.map((entry, index) => {
    const parsed = boundedString(entry, `${subject}[${index}]`, { max: 128 });
    if (!parsed) throw new Error(`${subject}[${index}] is invalid.`);
    return parsed;
  });
  if (new Set(strings).size !== strings.length) {
    throw new Error(`${subject} must not contain duplicates.`);
  }
  return strings;
}

function validateSequences(value: unknown, subject: string): number[] {
  if (!Array.isArray(value) || value.length > 512) {
    throw new Error(`${subject} must be a bounded integer array.`);
  }
  const sequences = value.map((entry, index) => {
    const sequence = nonNegativeInteger(entry, `${subject}[${index}]`);
    if (sequence === 0)
      throw new Error(`${subject}[${index}] must be positive.`);
    return sequence;
  });
  if (
    new Set(sequences).size !== sequences.length ||
    sequences.some((entry, index) => index > 0 && entry < sequences[index - 1])
  ) {
    throw new Error(`${subject} must be unique and ordered.`);
  }
  return sequences;
}

function sameOptional(left: unknown, right: unknown): boolean {
  return left === right;
}

function assertFinishedMatchesStarted(
  started: ActivityTraceEvent,
  finished: ActivityTraceEvent,
): void {
  const stableKeys: Array<keyof ActivityTraceEvent> = [
    'trace_id',
    'span_id',
    'parent_span_id',
    'activity',
    'checkpoint',
    'story_id',
    'task_id',
    'test_id',
    'process_id',
    'step_id',
    'agent',
    'requested_model',
    'thinking',
    'session_mode',
    'task_sha256',
    'started_at',
  ];
  if (
    stableKeys.some((key) => !sameOptional(started[key], finished[key])) ||
    JSON.stringify(started.tool_names) !== JSON.stringify(finished.tool_names)
  ) {
    throw new Error(
      `Activity trace span ${finished.span_id} finish metadata drifted from its start.`,
    );
  }
}

function validateEventShape(
  raw: unknown,
  index: number,
  expectedTraceId?: string,
): ActivityTraceEvent {
  const candidate = record(raw, `Activity trace record ${index + 1}`);
  for (const key of Object.keys(candidate)) {
    if (!EVENT_KEYS.has(key as keyof ActivityTraceEvent)) {
      throw new Error(
        `Activity trace record ${index + 1} has unknown field ${key}.`,
      );
    }
  }
  if (candidate.version !== 1) {
    throw new Error(`Activity trace record ${index + 1} must use version 1.`);
  }
  const traceId = boundedString(candidate.trace_id, 'trace_id', { max: 64 });
  if (!traceId || (expectedTraceId && traceId !== expectedTraceId)) {
    throw new Error(
      `Activity trace record ${index + 1} has the wrong trace id.`,
    );
  }
  const spanId = boundedString(candidate.span_id, 'span_id', { max: 32 });
  if (!spanId || !SPAN_ID.test(spanId)) {
    throw new Error(
      `Activity trace record ${index + 1} has an invalid span id.`,
    );
  }
  const event = candidate.event;
  if (event !== 'activity_started' && event !== 'activity_finished') {
    throw new Error(`Activity trace record ${index + 1} has an invalid event.`);
  }
  if (!ACTIVITIES.has(candidate.activity as TraceableActivity)) {
    throw new Error(
      `Activity trace record ${index + 1} has an invalid activity.`,
    );
  }
  if (!SESSION_MODES.has(candidate.session_mode as ActivityTraceSessionMode)) {
    throw new Error(
      `Activity trace record ${index + 1} has an invalid session mode.`,
    );
  }
  const taskSha = boundedString(candidate.task_sha256, 'task_sha256', {
    max: 64,
  });
  const previous = boundedString(
    candidate.previous_record_sha256,
    'previous_record_sha256',
    { max: 64 },
  );
  const current = boundedString(candidate.record_sha256, 'record_sha256', {
    max: 64,
  });
  if (
    !taskSha ||
    !previous ||
    !current ||
    ![taskSha, previous, current].every((value) => SHA256.test(value))
  ) {
    throw new Error(
      `Activity trace record ${index + 1} has an invalid SHA-256.`,
    );
  }

  const parsed = candidate as unknown as ActivityTraceEvent;
  nonNegativeInteger(parsed.sequence, 'sequence');
  boundedString(parsed.agent, 'agent', { max: 128 });
  boundedString(parsed.model, 'model', { max: 256 });
  boundedString(parsed.requested_model, 'requested_model', { max: 256 });
  boundedString(parsed.actual_model, 'actual_model', { max: 256 });
  boundedString(parsed.thinking, 'thinking', { max: 32 });
  if (!THINKING_LEVELS.has(parsed.thinking)) {
    throw new Error(`Activity trace record ${index + 1} has invalid thinking.`);
  }
  validateStringArray(parsed.tool_names, 'tool_names');
  if (
    (event === 'activity_started' &&
      (parsed.model !== parsed.requested_model ||
        parsed.actual_model !== parsed.requested_model)) ||
    (event === 'activity_finished' && parsed.model !== parsed.actual_model)
  ) {
    throw new Error(
      `Activity trace record ${index + 1} has inconsistent model metadata.`,
    );
  }
  timestamp(parsed.started_at, 'started_at');
  for (const [key, value] of [
    ['parent_span_id', parsed.parent_span_id],
    ['checkpoint', parsed.checkpoint],
    ['story_id', parsed.story_id],
    ['task_id', parsed.task_id],
    ['test_id', parsed.test_id],
    ['process_id', parsed.process_id],
    ['step_id', parsed.step_id],
    ['stop_reason', parsed.stop_reason],
    ['resulting_checkpoint', parsed.resulting_checkpoint],
  ] as const) {
    boundedString(value, key, { optional: true, max: 256 });
  }
  if (parsed.parent_span_id && !SPAN_ID.test(parsed.parent_span_id)) {
    throw new Error(
      `Activity trace record ${index + 1} has an invalid parent span.`,
    );
  }

  if (event === 'activity_started') {
    for (const key of [
      'completed_at',
      'duration_ms',
      'status',
      'exit_code',
      'stop_reason',
      'error_message_sha256',
      'output_sha256',
      'usage',
      'tool_call_counts',
      'execution_record_sequences',
      'resulting_checkpoint',
    ] as const) {
      if (parsed[key] !== undefined) {
        throw new Error(`Activity started event must not contain ${key}.`);
      }
    }
  } else {
    timestamp(parsed.completed_at, 'completed_at');
    nonNegativeInteger(parsed.duration_ms, 'duration_ms');
    if (!STATUSES.has(parsed.status as ActivityTraceStatus)) {
      throw new Error(
        `Activity trace record ${index + 1} has an invalid status.`,
      );
    }
    if (
      parsed.exit_code !== undefined &&
      !Number.isSafeInteger(parsed.exit_code)
    ) {
      throw new Error(
        `Activity trace record ${index + 1} has an invalid exit code.`,
      );
    }
    for (const [key, value] of [
      ['error_message_sha256', parsed.error_message_sha256],
      ['output_sha256', parsed.output_sha256],
    ] as const) {
      if (value !== undefined && !SHA256.test(value)) {
        throw new Error(
          `Activity trace record ${index + 1} has an invalid ${key}.`,
        );
      }
    }
    const usage = validateUsage(parsed.usage, 'usage');
    validateCountMap(parsed.tool_call_counts, 'tool_call_counts');
    validateSequences(
      parsed.execution_record_sequences,
      'execution_record_sequences',
    );
    if (
      (parsed.status === 'aborted' && parsed.stop_reason !== 'aborted') ||
      (parsed.status === 'timeout' && parsed.stop_reason !== 'timeout')
    ) {
      throw new Error(
        `Activity trace record ${index + 1} does not preserve its termination reason.`,
      );
    }
    if (parsed.model === 'deterministic') {
      const deterministicUsage = usage;
      if (
        parsed.thinking !== 'off' ||
        parsed.session_mode !== 'deterministic' ||
        parsed.tool_names.length > 0 ||
        deterministicUsage.turns !== 0 ||
        deterministicUsage.input_tokens !== 0 ||
        deterministicUsage.output_tokens !== 0 ||
        deterministicUsage.cache_read_tokens !== 0 ||
        deterministicUsage.cache_write_tokens !== 0 ||
        deterministicUsage.cost_usd !== 0 ||
        deterministicUsage.context_tokens_at_end !== null
      ) {
        throw new Error(
          `Activity trace record ${index + 1} has invalid deterministic usage.`,
        );
      }
    }
    if (
      Date.parse(parsed.completed_at as string) < Date.parse(parsed.started_at)
    ) {
      throw new Error(
        `Activity trace record ${index + 1} completes before it starts.`,
      );
    }
  }
  return parsed;
}

export function activityTraceRelativePath(iterationId: string): string {
  return `${iterationRootRelative(iterationId)}/activity-trace.jsonl`;
}

export function activityTracePath(cwd: string, iterationId: string): string {
  return join(
    iterationRoot(cwd, { iteration_id: iterationId }),
    'activity-trace.jsonl',
  );
}

export function readActivityTrace(
  path: string,
  expectedTraceId?: string,
): ActivityTraceEvent[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf8');
  if (!content || !content.endsWith('\n')) {
    throw new Error(`Activity trace is truncated or empty: ${path}.`);
  }
  let rawRecords: unknown[];
  try {
    rawRecords = content
      .slice(0, -1)
      .split('\n')
      .map((line) => JSON.parse(line) as unknown);
  } catch {
    throw new Error(`Activity trace is not valid append-only JSONL: ${path}.`);
  }

  const records: ActivityTraceEvent[] = [];
  const starts = new Map<string, ActivityTraceEvent>();
  const finishes = new Set<string>();
  let previous = '0'.repeat(64);
  for (const [index, raw] of rawRecords.entries()) {
    const current = validateEventShape(raw, index, expectedTraceId);
    if (current.sequence !== index + 1) {
      throw new Error(
        `Activity trace sequence drifted at record ${index + 1}.`,
      );
    }
    if (
      current.previous_record_sha256 !== previous ||
      current.record_sha256 !== unsignedRecordSha256(current)
    ) {
      throw new Error(
        `Activity trace hash chain failed at record ${index + 1}.`,
      );
    }
    if (current.event === 'activity_started') {
      if (starts.has(current.span_id)) {
        throw new Error(
          `Activity trace span ${current.span_id} started twice.`,
        );
      }
      if (
        current.parent_span_id &&
        (!starts.has(current.parent_span_id) ||
          finishes.has(current.parent_span_id))
      ) {
        throw new Error(
          `Activity trace span ${current.span_id} has an inactive parent ${current.parent_span_id}.`,
        );
      }
      starts.set(current.span_id, current);
    } else {
      const started = starts.get(current.span_id);
      if (!started || finishes.has(current.span_id)) {
        throw new Error(
          `Activity trace span ${current.span_id} has an invalid finish.`,
        );
      }
      assertFinishedMatchesStarted(started, current);
      const incompleteChild = [...starts.values()].find(
        ({ parent_span_id, span_id }) =>
          parent_span_id === current.span_id && !finishes.has(span_id),
      );
      if (incompleteChild) {
        throw new Error(
          `Activity trace parent ${current.span_id} finished before child ${incompleteChild.span_id}.`,
        );
      }
      finishes.add(current.span_id);
    }
    records.push(current);
    previous = current.record_sha256;
  }
  return records;
}

export function incompleteActivitySpanIds(
  records: readonly ActivityTraceEvent[],
): string[] {
  const started = records
    .filter(({ event }) => event === 'activity_started')
    .map(({ span_id }) => span_id);
  const finished = new Set(
    records
      .filter(({ event }) => event === 'activity_finished')
      .map(({ span_id }) => span_id),
  );
  return started.filter((spanId) => !finished.has(spanId));
}

export function validateActivityTrace(
  path: string,
  expectedTraceId?: string,
): ActivityTraceEvent[] {
  const records = readActivityTrace(path, expectedTraceId);
  const incomplete = incompleteActivitySpanIds(records);
  if (incomplete.length > 0) {
    throw new Error(
      `Activity trace has incomplete spans: ${incomplete.join(', ')}.`,
    );
  }
  return records;
}

function nextSpanId(records: readonly ActivityTraceEvent[]): string {
  const highest = records
    .filter(({ event }) => event === 'activity_started')
    .map(({ span_id }) => Number(span_id.slice('ACT-'.length)))
    .reduce((maximum, value) => Math.max(maximum, value), 0);
  return `ACT-${String(highest + 1).padStart(6, '0')}`;
}

function appendRecord(
  path: string,
  unsigned: Omit<ActivityTraceEvent, 'record_sha256'>,
): ActivityTraceEvent {
  const record: ActivityTraceEvent = {
    ...unsigned,
    record_sha256: digest(JSON.stringify(unsigned)),
  };
  validateEventShape(record, record.sequence - 1, record.trace_id);
  appendFileSync(path, `${JSON.stringify(record)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return record;
}

export function startActivityTrace(
  cwd: string,
  input: ActivityTraceStartInput,
): ActivityTraceSpan {
  const path = activityTracePath(cwd, input.iterationId);
  mkdirSync(dirname(path), { recursive: true });
  const records = readActivityTrace(path, input.iterationId);
  if (
    input.parentSpanId &&
    !records.some(
      ({ span_id, event }) =>
        span_id === input.parentSpanId && event === 'activity_started',
    )
  ) {
    throw new Error(
      `Activity trace parent span is missing: ${input.parentSpanId}.`,
    );
  }
  const startedAt = input.startedAt ?? new Date().toISOString();
  const spanId = nextSpanId(records);
  const started = appendRecord(path, {
    version: 1,
    sequence: records.length + 1,
    trace_id: input.iterationId,
    span_id: spanId,
    ...(input.parentSpanId ? { parent_span_id: input.parentSpanId } : {}),
    event: 'activity_started',
    activity: input.activity,
    ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
    ...(input.storyId ? { story_id: input.storyId } : {}),
    ...(input.taskId ? { task_id: input.taskId } : {}),
    ...(input.testId ? { test_id: input.testId } : {}),
    ...(input.processId ? { process_id: input.processId } : {}),
    ...(input.stepId ? { step_id: input.stepId } : {}),
    agent: input.agent,
    model: input.requestedModel,
    requested_model: input.requestedModel,
    actual_model: input.requestedModel,
    thinking: input.thinking,
    session_mode: input.sessionMode,
    task_sha256: digest(input.task),
    tool_names: [...input.toolNames],
    started_at: startedAt,
    previous_record_sha256: records.at(-1)?.record_sha256 ?? '0'.repeat(64),
  });
  return { traceId: input.iterationId, spanId, path, started };
}

export function finishActivityTrace(
  span: ActivityTraceSpan,
  input: ActivityTraceFinishInput,
): ActivityTraceEvent {
  const records = readActivityTrace(span.path, span.traceId);
  const started = records.find(
    ({ span_id, event }) =>
      span_id === span.spanId && event === 'activity_started',
  );
  if (
    !started ||
    records.some(
      ({ span_id, event }) =>
        span_id === span.spanId && event === 'activity_finished',
    )
  ) {
    throw new Error(`Activity trace span cannot be finished: ${span.spanId}.`);
  }
  const incompleteChild = records.find(
    ({ parent_span_id, event, span_id }) =>
      parent_span_id === span.spanId &&
      event === 'activity_started' &&
      !records.some(
        (candidate) =>
          candidate.span_id === span_id &&
          candidate.event === 'activity_finished',
      ),
  );
  if (incompleteChild) {
    throw new Error(
      `Activity trace parent ${span.spanId} cannot finish before child ${incompleteChild.span_id}.`,
    );
  }
  const completedAt = input.completedAt ?? new Date().toISOString();
  const inferredDuration = Math.max(
    0,
    Date.parse(completedAt) - Date.parse(started.started_at),
  );
  const actualModel = input.actualModel ?? started.requested_model;
  return appendRecord(span.path, {
    version: 1,
    sequence: records.length + 1,
    trace_id: started.trace_id,
    span_id: started.span_id,
    ...(started.parent_span_id
      ? { parent_span_id: started.parent_span_id }
      : {}),
    event: 'activity_finished',
    activity: started.activity,
    ...(started.checkpoint ? { checkpoint: started.checkpoint } : {}),
    ...(started.story_id ? { story_id: started.story_id } : {}),
    ...(started.task_id ? { task_id: started.task_id } : {}),
    ...(started.test_id ? { test_id: started.test_id } : {}),
    ...(started.process_id ? { process_id: started.process_id } : {}),
    ...(started.step_id ? { step_id: started.step_id } : {}),
    agent: started.agent,
    model: actualModel,
    requested_model: started.requested_model,
    actual_model: actualModel,
    thinking: started.thinking,
    session_mode: started.session_mode,
    task_sha256: started.task_sha256,
    tool_names: [...started.tool_names],
    started_at: started.started_at,
    completed_at: completedAt,
    duration_ms: input.durationMs ?? inferredDuration,
    status: input.status,
    ...(input.exitCode !== undefined ? { exit_code: input.exitCode } : {}),
    ...(input.stopReason ? { stop_reason: input.stopReason } : {}),
    ...(input.errorMessage
      ? { error_message_sha256: digest(input.errorMessage) }
      : {}),
    ...(input.output ? { output_sha256: digest(input.output) } : {}),
    usage: { ...input.usage },
    tool_call_counts: { ...input.toolCallCounts },
    execution_record_sequences: [...(input.executionRecordSequences ?? [])],
    ...(input.resultingCheckpoint
      ? { resulting_checkpoint: input.resultingCheckpoint }
      : {}),
    previous_record_sha256: records.at(-1)?.record_sha256 ?? '0'.repeat(64),
  });
}
