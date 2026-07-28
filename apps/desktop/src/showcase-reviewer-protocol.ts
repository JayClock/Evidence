const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const MAX_ITEMS = 100;

export interface ShowcaseReviewerRuntimeRequest {
  id: string;
  timeoutMs: number;
  worktreeRoot: string;
  evidenceBundleSha256: string;
  story: {
    reference: string;
    title: string;
    problem: string;
    role: string;
    goal: string;
    value: string;
    scenarios: Array<{
      reference: string;
      title: string;
      given: string[];
      when: string;
      then: string[];
      businessData: string[];
    }>;
  };
  pair: {
    manifestSha256: string;
    finalDiffSha256: string;
    approvedCommitSha: string;
    changedPaths: string[];
  };
  q2Observations: Array<{
    testId: string;
    scenarioIds: string[];
    command: string;
    termination: string;
    exitCode: number | null;
    recordSha256: string;
  }>;
  productObservations: Array<{
    scenarioReference: string;
    observedOutcomes: string[];
    observation: string;
    valueFeedback: string;
    evidenceRefs: string[];
  }>;
  riskDecisions: Array<{
    quadrant: string;
    disposition: string;
    activities: string[];
    reason: string;
  }>;
  evaluations: Array<{
    quadrant: string;
    activity: string;
    outcome: string;
    finding: string;
    evidenceRefs: string[];
  }>;
}

export type ShowcaseReviewerEvent =
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
        observedFacts: string[];
        productDomainFeedback: string[];
        technicalQualityFeedback: string[];
        unresolvedAssumptions: string[];
        recommendation: 'accept' | 'revise';
        agentCallCount: 1;
      };
    };

export function parseShowcaseReviewerRuntimeRequest(
  value: unknown,
): ShowcaseReviewerRuntimeRequest {
  const input = object(value, 'Showcase Reviewer request');
  const story = object(input.story, 'Showcase Story');
  const pair = object(input.pair, 'Showcase Pair');
  return {
    id: identifier(input.id, 'request id'),
    timeoutMs: boundedInteger(input.timeoutMs, 'Reviewer timeout', 1, 600_000),
    worktreeRoot: text(input.worktreeRoot, 'worktree root', 4_096),
    evidenceBundleSha256: sha256(
      input.evidenceBundleSha256,
      'evidence bundle SHA-256',
    ),
    story: {
      reference: text(story.reference, 'Story reference', 100),
      title: text(story.title, 'Story title', 500),
      problem: text(story.problem, 'Story problem', 4_000),
      role: text(story.role, 'Story role', 500),
      goal: text(story.goal, 'Story goal', 2_000),
      value: text(story.value, 'Story value', 2_000),
      scenarios: objectArray(story.scenarios, 'Story Scenarios').map(
        (scenario, index) => ({
          reference: text(
            scenario.reference,
            `Scenario ${String(index + 1)} reference`,
            100,
          ),
          title: text(
            scenario.title,
            `Scenario ${String(index + 1)} title`,
            500,
          ),
          given: strings(scenario.given, 'Scenario Given'),
          when: text(scenario.when, 'Scenario When', 2_000),
          then: strings(scenario.then, 'Scenario Then'),
          businessData: strings(
            scenario.businessData,
            'Scenario business data',
          ),
        }),
      ),
    },
    pair: {
      manifestSha256: sha256(pair.manifestSha256, 'Pair Manifest SHA-256'),
      finalDiffSha256: sha256(pair.finalDiffSha256, 'Pair diff SHA-256'),
      approvedCommitSha: commit(pair.approvedCommitSha),
      changedPaths: strings(pair.changedPaths, 'Pair changed paths'),
    },
    q2Observations: objectArray(
      input.q2Observations,
      'Q2 observations',
    ) as ShowcaseReviewerRuntimeRequest['q2Observations'],
    productObservations: objectArray(
      input.productObservations,
      'product observations',
    ) as ShowcaseReviewerRuntimeRequest['productObservations'],
    riskDecisions: objectArray(
      input.riskDecisions,
      'risk decisions',
    ) as ShowcaseReviewerRuntimeRequest['riskDecisions'],
    evaluations: objectArray(
      input.evaluations,
      'evaluations',
    ) as ShowcaseReviewerRuntimeRequest['evaluations'],
  };
}

export function parseShowcaseReviewerEvent(
  value: unknown,
): ShowcaseReviewerEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.id !== 'string' ||
    !ID.test(input.id) ||
    typeof input.event !== 'string' ||
    typeof input.data !== 'string'
  ) {
    return null;
  }
  if (
    input.event === 'progress' ||
    input.event === 'tool-start' ||
    input.event === 'tool-end' ||
    input.event === 'error'
  ) {
    return { id: input.id, event: input.event, data: input.data };
  }
  if (input.event !== 'complete') return null;
  const details = nullableObject(input.details);
  if (!details) return null;
  const observedFacts = stringsOrNull(details.observedFacts);
  const productDomainFeedback = stringsOrNull(details.productDomainFeedback);
  const technicalQualityFeedback = stringsOrNull(
    details.technicalQualityFeedback,
  );
  const unresolvedAssumptions = stringsOrNull(details.unresolvedAssumptions);
  if (
    !observedFacts?.length ||
    !productDomainFeedback ||
    !technicalQualityFeedback ||
    !unresolvedAssumptions ||
    (details.recommendation !== 'accept' &&
      details.recommendation !== 'revise') ||
    details.agentCallCount !== 1
  ) {
    return null;
  }
  return {
    id: input.id,
    event: 'complete',
    data: input.data,
    details: {
      observedFacts,
      productDomainFeedback,
      technicalQualityFeedback,
      unresolvedAssumptions,
      recommendation: details.recommendation,
      agentCallCount: 1,
    },
  };
}

function objectArray(value: unknown, label: string): Record<string, unknown>[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_ITEMS ||
    value.some(
      (candidate) =>
        !candidate || typeof candidate !== 'object' || Array.isArray(candidate),
    )
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value as Record<string, unknown>[];
}

function strings(value: unknown, label: string): string[] {
  const result = stringsOrNull(value);
  if (!result) throw new Error(`${label} is invalid.`);
  return result;
}

function stringsOrNull(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > MAX_ITEMS ||
    value.some(
      (candidate) =>
        typeof candidate !== 'string' ||
        !candidate.trim() ||
        candidate.length > 4_000,
    )
  ) {
    return null;
  }
  return value as string[];
}

function nullableObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function object(value: unknown, label: string): Record<string, unknown> {
  const result = nullableObject(value);
  if (!result) throw new Error(`${label} must be an object.`);
  return result;
}

function identifier(value: unknown, label: string): string {
  const normalized = text(value, label, 256);
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

function sha256(value: unknown, label: string): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function commit(value: unknown): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(normalized)) {
    throw new Error('approved commit SHA is invalid.');
  }
  return normalized;
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return Number(value);
}
