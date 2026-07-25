import { isAbsolute } from 'node:path';

export interface CodingScenarioSnapshot {
  id: string;
  title: string;
  given: string[];
  when: string;
  then: string[];
}

export interface CodingStoryRevisionSnapshot {
  id: string;
  revisionNumber: number;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: string;
  contentSha256: string;
  scenarios: CodingScenarioSnapshot[];
}

export const CODING_QUALITY_GATE_NAMES = [
  'lint',
  'typecheck',
  'test',
  'build',
  'api:check',
] as const;

export type CodingQualityGateName = (typeof CODING_QUALITY_GATE_NAMES)[number];
export type LockedCodingQualityGateScripts = Partial<
  Record<CodingQualityGateName, string>
>;

export interface CodingAgentRuntimeRequest {
  id: string;
  runId: string;
  worktreeRoot: string;
  qualityGateScripts: LockedCodingQualityGateScripts;
  storyRevision: CodingStoryRevisionSnapshot;
}

export interface CodingAgentEvent {
  id: string;
  event: string;
  data: string;
}

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MAX_TEXT = 20_000;
const MAX_SCENARIOS = 50;
const MAX_STEPS = 20;

export function parseCodingAgentRuntimeRequest(
  value: unknown,
): CodingAgentRuntimeRequest {
  const input = record(value, 'Coding Agent request');
  const worktreeRoot = requiredString(input.worktreeRoot, 'worktreeRoot');
  if (!isAbsolute(worktreeRoot)) {
    throw new Error('Coding Agent worktreeRoot must be absolute.');
  }
  const storyRevision = parseCodingStoryRevisionSnapshot(input.storyRevision);

  return {
    id: safeId(input.id, 'request id'),
    runId: safeId(input.runId, 'run id'),
    worktreeRoot,
    qualityGateScripts: parseQualityGateScripts(input.qualityGateScripts),
    storyRevision,
  };
}

export function parseCodingStoryRevisionSnapshot(
  value: unknown,
): CodingStoryRevisionSnapshot {
  const story = record(value, 'storyRevision');
  const scenarios = requiredArray(story.scenarios, 'storyRevision.scenarios');
  if (scenarios.length === 0 || scenarios.length > MAX_SCENARIOS) {
    throw new Error('Coding Agent Story Revision must contain Scenarios.');
  }
  const contentSha256 = requiredString(
    story.contentSha256,
    'storyRevision.contentSha256',
  ).toLowerCase();
  if (!SHA256_PATTERN.test(contentSha256)) {
    throw new Error('Coding Agent Story Revision SHA-256 is invalid.');
  }

  return {
    id: safeId(story.id, 'Story Revision id'),
    revisionNumber: positiveInteger(
      story.revisionNumber,
      'storyRevision.revisionNumber',
    ),
    title: boundedText(story.title, 'storyRevision.title'),
    problem: boundedText(story.problem, 'storyRevision.problem'),
    role: boundedText(story.role, 'storyRevision.role'),
    goal: boundedText(story.goal, 'storyRevision.goal'),
    value: boundedText(story.value, 'storyRevision.value'),
    cognitiveMode: boundedText(
      story.cognitiveMode,
      'storyRevision.cognitiveMode',
    ),
    contentSha256,
    scenarios: scenarios.map(parseScenario),
  };
}

export function parseCodingAgentEvent(value: unknown): CodingAgentEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Partial<CodingAgentEvent>;
  if (
    typeof event.id !== 'string' ||
    typeof event.event !== 'string' ||
    typeof event.data !== 'string'
  ) {
    return null;
  }
  return { id: event.id, event: event.event, data: event.data };
}

function parseQualityGateScripts(
  value: unknown,
): LockedCodingQualityGateScripts {
  const input = record(value, 'qualityGateScripts');
  const unsupported = Object.keys(input).filter(
    (key) => !CODING_QUALITY_GATE_NAMES.includes(key as CodingQualityGateName),
  );
  if (unsupported.length > 0) {
    throw new Error('Coding Agent quality gate name is unsupported.');
  }
  return Object.fromEntries(
    Object.entries(input).map(([name, script]) => [
      name,
      boundedText(script, `qualityGateScripts.${name}`),
    ]),
  );
}

function parseScenario(value: unknown, index: number): CodingScenarioSnapshot {
  const scenario = record(value, `scenario ${String(index + 1)}`);
  return {
    id: safeId(scenario.id, `scenario ${String(index + 1)} id`),
    title: boundedText(scenario.title, `scenario ${String(index + 1)} title`),
    given: steps(scenario.given, `scenario ${String(index + 1)} given`),
    when: boundedText(scenario.when, `scenario ${String(index + 1)} when`),
    then: steps(scenario.then, `scenario ${String(index + 1)} then`),
  };
}

function steps(value: unknown, label: string): string[] {
  const entries = requiredArray(value, label);
  if (entries.length === 0 || entries.length > MAX_STEPS) {
    throw new Error(
      `${label} must contain between 1 and ${String(MAX_STEPS)} steps.`,
    );
  }
  return entries.map((entry, index) =>
    boundedText(entry, `${label}[${String(index)}]`),
  );
}

function safeId(value: unknown, label: string): string {
  const id = requiredString(value, label).trim();
  if (!ID_PATTERN.test(id)) {
    throw new Error(`Coding Agent ${label} is invalid.`);
  }
  return id;
}

function boundedText(value: unknown, label: string): string {
  const text = requiredString(value, label).replace(/\r\n?/g, '\n').trim();
  if (text.length > MAX_TEXT) {
    throw new Error(`Coding Agent ${label} is too long.`);
  }
  return text;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`Coding Agent ${label} must be a positive integer.`);
  }
  return Number(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Coding Agent ${label} is required.`);
  }
  return value;
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Coding Agent ${label} must be an array.`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Coding Agent ${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
