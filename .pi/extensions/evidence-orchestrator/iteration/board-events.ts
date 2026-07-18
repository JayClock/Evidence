import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { boardRoot } from './board-repository';
import type { FlowLane } from './board-state';

export type BoardEventType =
  | 'admission'
  | 'pull'
  | 'rework_overflow'
  | 'lease_recovered'
  | 'provisioning_recovered'
  | 'archived';

export interface BoardEvent {
  version: 1;
  event_id: string;
  type: BoardEventType;
  iteration_id: string;
  recorded_at: string;
  from_lane?: FlowLane;
  to_lane?: FlowLane;
  outcome?: string;
  policy_sha256?: string;
  reason?: string;
  lease_id?: string;
}

export type BoardEventInput = Omit<BoardEvent, 'version' | 'event_id'>;

const EVENT_TYPES = new Set<BoardEventType>([
  'admission',
  'pull',
  'rework_overflow',
  'lease_recovered',
  'provisioning_recovered',
  'archived',
]);
const LANES = new Set<FlowLane>([
  'discovery',
  'planning',
  'ready',
  'delivery',
  'review',
  'done',
]);
const FIELDS = new Set([
  'version',
  'event_id',
  'type',
  'iteration_id',
  'recorded_at',
  'from_lane',
  'to_lane',
  'outcome',
  'policy_sha256',
  'reason',
  'lease_id',
]);

export function boardEventsPath(cwd: string): string {
  return join(boardRoot(cwd), 'events.jsonl');
}

function optionalText(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0);
}

function normalizeBoardEvent(value: unknown): BoardEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Evidence Board event must be an object.');
  }
  const event = value as Record<string, unknown>;
  if (Object.keys(event).some((field) => !FIELDS.has(field))) {
    throw new Error('Evidence Board event has unsupported fields.');
  }
  if (
    event.version !== 1 ||
    typeof event.event_id !== 'string' ||
    !/^EVT-[0-9a-f-]{36}$/.test(event.event_id) ||
    !EVENT_TYPES.has(event.type as BoardEventType) ||
    typeof event.iteration_id !== 'string' ||
    !/^ITER-\d{4,}$/.test(event.iteration_id) ||
    typeof event.recorded_at !== 'string' ||
    !Number.isFinite(Date.parse(event.recorded_at)) ||
    (event.from_lane !== undefined &&
      !LANES.has(event.from_lane as FlowLane)) ||
    (event.to_lane !== undefined && !LANES.has(event.to_lane as FlowLane)) ||
    !optionalText(event.outcome) ||
    (event.policy_sha256 !== undefined &&
      (typeof event.policy_sha256 !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(event.policy_sha256))) ||
    !optionalText(event.reason) ||
    !optionalText(event.lease_id)
  ) {
    throw new Error('Evidence Board event is invalid.');
  }
  return event as unknown as BoardEvent;
}

export function appendBoardEvent(
  cwd: string,
  input: BoardEventInput,
  eventId = `EVT-${randomUUID()}`,
): BoardEvent {
  const event = normalizeBoardEvent({
    version: 1,
    event_id: eventId,
    ...input,
  });
  const path = boardEventsPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, 'a', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(event)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return event;
}

export function readBoardEvents(cwd: string): BoardEvent[] {
  const path = boardEventsPath(cwd);
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf8');
  if (content && !content.endsWith('\n')) {
    throw new Error(`Evidence Board event log is truncated: ${path}.`);
  }
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return normalizeBoardEvent(JSON.parse(line) as unknown);
      } catch (error) {
        throw new Error(
          `Evidence Board event is invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
}
