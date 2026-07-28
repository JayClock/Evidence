const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

export type PairRedClassification =
  | 'behavior'
  | 'compile'
  | 'dependency'
  | 'configuration'
  | 'network'
  | 'fixture'
  | 'other';

export interface PairRedReviewerRuntimeRequest {
  id: string;
  timeoutMs: number;
  test: {
    id: string;
    intent: string;
    scenarioOutcome: string | null;
  };
  expectedRed: {
    kind: 'behavior';
    failure: string;
  };
  observation: {
    termination: 'exited';
    exitCode: number;
    stdout: string;
    stderr: string;
    stdoutSha256: string;
    stderrSha256: string;
  };
}

export type PairRedReviewerEvent =
  | {
      id: string;
      event: 'progress' | 'tool-start' | 'tool-end' | 'error';
      data: string;
    }
  | {
      id: string;
      event: 'complete';
      data: string;
      details: {
        classification: PairRedClassification;
        reason: string;
        agentCallCount: 1;
      };
    };

export function parsePairRedReviewerRuntimeRequest(
  value: unknown,
): PairRedReviewerRuntimeRequest {
  const input = object(value, 'Red Reviewer request');
  const test = object(input.test, 'Red Reviewer TEST');
  const expected = object(input.expectedRed, 'expected Red');
  const observation = object(input.observation, 'Red observation');
  const exitCode = integer(observation.exitCode, 'Red exit code');
  if (exitCode === 0) {
    throw new Error('Red Reviewer requires a non-zero exited observation.');
  }
  return {
    id: identifier(input.id, 'request id'),
    timeoutMs: boundedInteger(input.timeoutMs, 'Reviewer timeout', 1, 300_000),
    test: {
      id: identifier(test.id, 'TEST id'),
      intent: text(test.intent, 'TEST intent', 2_000),
      scenarioOutcome: optionalText(
        test.scenarioOutcome,
        'Scenario outcome',
        2_000,
      ),
    },
    expectedRed: {
      kind: literal(expected.kind, 'behavior', 'expected Red kind'),
      failure: text(expected.failure, 'expected Red failure', 2_000),
    },
    observation: {
      termination: literal(
        observation.termination,
        'exited',
        'Red termination',
      ),
      exitCode,
      stdout: boundedOutput(observation.stdout, 'Red stdout'),
      stderr: boundedOutput(observation.stderr, 'Red stderr'),
      stdoutSha256: sha256(observation.stdoutSha256, 'stdout SHA-256'),
      stderrSha256: sha256(observation.stderrSha256, 'stderr SHA-256'),
    },
  };
}

export function parsePairRedReviewerEvent(
  value: unknown,
): PairRedReviewerEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Partial<PairRedReviewerEvent>;
  if (
    typeof event.id !== 'string' ||
    !ID.test(event.id) ||
    typeof event.event !== 'string' ||
    typeof event.data !== 'string'
  ) {
    return null;
  }
  if (
    event.event === 'progress' ||
    event.event === 'tool-start' ||
    event.event === 'tool-end' ||
    event.event === 'error'
  ) {
    return { id: event.id, event: event.event, data: event.data };
  }
  if (event.event !== 'complete') return null;
  const details = (event as { details?: unknown }).details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }
  const candidate = details as Record<string, unknown>;
  const classification = classificationOrNull(candidate.classification);
  if (
    !classification ||
    typeof candidate.reason !== 'string' ||
    !candidate.reason.trim() ||
    candidate.reason.length > 2_000 ||
    candidate.agentCallCount !== 1
  ) {
    return null;
  }
  return {
    id: event.id,
    event: 'complete',
    data: event.data,
    details: {
      classification,
      reason: candidate.reason,
      agentCallCount: 1,
    },
  };
}

export function parseRedClassification(value: unknown): PairRedClassification {
  const classification = classificationOrNull(value);
  if (!classification) throw new Error('Red classification is invalid.');
  return classification;
}

function classificationOrNull(value: unknown): PairRedClassification | null {
  return value === 'behavior' ||
    value === 'compile' ||
    value === 'dependency' ||
    value === 'configuration' ||
    value === 'network' ||
    value === 'fixture' ||
    value === 'other'
    ? value
    : null;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string): string {
  const normalized = text(value, label, 500);
  if (!ID.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function optionalText(
  value: unknown,
  label: string,
  maximum: number,
): string | null {
  return value === null || value === undefined || value === ''
    ? null
    : text(value, label, maximum);
}

function boundedOutput(value: unknown, label: string): string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 50 * 1024) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function literal<const T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw new Error(`${label} is invalid.`);
  return expected;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const result = integer(value, label);
  if (result < minimum || result > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return result;
}

function sha256(value: unknown, label: string): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}
