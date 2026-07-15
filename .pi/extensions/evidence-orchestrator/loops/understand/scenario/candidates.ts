import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  artifactPath,
  artifactRelativePath,
} from '../../../iteration/artifact-layout';
import { readState, writeState } from '../../../iteration/state-repository';
import type {
  ConfirmedScenario,
  ScenarioDraft,
  UnderstandingDecision,
  UnderstandingDecisionAction,
  WorkflowState,
} from '../../../iteration/state';
import { waivePendingClarification } from '../tqa/conversation';

const UNDERSTANDING_ACTIONS = new Set<UnderstandingDecisionAction>([
  'confirmed',
  'continue',
  'split',
  'deferred',
]);

export interface ScenarioCandidateInput {
  title: string;
  given: string[];
  when: string;
  then: string[];
  businessData: string[];
}

function requiredText(value: string, name: string, singleLine = false): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  if (singleLine && /[\r\n]/.test(normalized)) {
    throw new Error(`${name} must be a single line.`);
  }
  return normalized;
}

function requiredTexts(values: string[], name: string): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${name} must be a non-empty list.`);
  }
  const normalized = values.map((value, index) =>
    requiredText(value, `${name}[${index}]`),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} must not contain duplicates.`);
  }
  return normalized;
}

function requireUnderstandState(cwd: string): WorkflowState {
  const state = readState(cwd);
  if (state.loop !== 'understand') {
    throw new Error(
      `Scenario understanding is only available in the Understand loop; current loop is ${state.loop}.`,
    );
  }
  if (state.halted) {
    throw new Error(`Iteration is halted: ${state.halted.reason}`);
  }
  return state;
}

function normalizedStoryId(storyId: string): string {
  const normalized = storyId.trim().toUpperCase();
  if (!/^US-\d{3,}$/.test(normalized)) {
    throw new Error(`Invalid story id: ${storyId}. Expected US-xxx.`);
  }
  return normalized;
}

/** Persist concrete examples without granting them acceptance authority. */
export function proposeScenarioDrafts(
  cwd: string,
  storyId: string,
  candidates: ScenarioCandidateInput[],
  now = new Date().toISOString(),
): WorkflowState {
  const state = requireUnderstandState(cwd);
  if (state.understand_stage !== 'tqa') {
    throw new Error(
      `Scenario drafts can only be proposed after TQA; current Understand stage is ${state.understand_stage ?? 'unset'}.`,
    );
  }
  if (state.pending_clarification) {
    throw new Error(
      `Pending clarification ${state.pending_clarification.question_id} must be answered before proposing Scenarios.`,
    );
  }
  if (state.scenario_drafts?.length) {
    throw new Error('Scenario drafts are already awaiting a human decision.');
  }
  const activeStoryId = state.active_clarification_story?.story_id;
  const normalized = normalizedStoryId(storyId);
  if (!activeStoryId || activeStoryId !== normalized) {
    throw new Error(
      `Scenario drafts must belong to the active Story ${activeStoryId ?? 'none'}, not ${normalized}.`,
    );
  }
  if (
    !Array.isArray(candidates) ||
    candidates.length < 1 ||
    candidates.length > 5
  ) {
    throw new Error('Propose between one and five concrete Scenario drafts.');
  }

  const drafts: ScenarioDraft[] = candidates.map((candidate, index) => {
    const draftId = `DRAFT-${String(index + 1).padStart(3, '0')}`;
    const artifactPathValue = artifactRelativePath(
      state,
      `artifacts/01-requirements/scenario-drafts/${normalized}-${draftId}.json`,
    );
    return {
      version: 1,
      draft_id: draftId,
      story_id: normalized,
      title: requiredText(candidate.title, `Scenario ${draftId} title`, true),
      given: requiredTexts(candidate.given, `Scenario ${draftId} given`),
      when: requiredText(candidate.when, `Scenario ${draftId} when`),
      then: requiredTexts(candidate.then, `Scenario ${draftId} then`),
      business_data: requiredTexts(
        candidate.businessData,
        `Scenario ${draftId} businessData`,
      ),
      proposed_at: now,
      artifact_path: artifactPathValue,
    } satisfies ScenarioDraft;
  });
  for (const draft of drafts) {
    const absolute = `${cwd}/${draft.artifact_path}`;
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(draft, null, 2)}\n`);
  }

  return writeState(cwd, {
    ...state,
    understand_stage: 'scenario_review',
    scenario_drafts: drafts,
  });
}

function confirmedScenarioMarkdown(scenario: ConfirmedScenario): string {
  const metadata = {
    version: scenario.version,
    story_id: scenario.story_id,
    scenario_id: scenario.scenario_id,
    source_draft_id: scenario.source_draft_id,
    confirmed_by: scenario.confirmed_by,
    confirmation_reason: scenario.confirmation_reason,
    confirmed_at: scenario.confirmed_at,
  };
  return `<!-- evidence-orchestrator-scenario
${JSON.stringify(metadata, null, 2)}
-->
# ${scenario.story_id} / ${scenario.scenario_id} ${scenario.title}

## Given

${scenario.given.map((item) => `- ${item}`).join('\n')}

## When

${scenario.when}

## Then

${scenario.then.map((item) => `- ${item}`).join('\n')}

## 关键业务数据

${scenario.business_data.map((item) => `- ${item}`).join('\n')}
`;
}

function ensureNoConfirmedScenario(cwd: string, state: WorkflowState): void {
  if (state.confirmed_scenarios?.length || state.confirmed_scenario) {
    const current = state.confirmed_scenarios?.[0] ?? state.confirmed_scenario;
    throw new Error(
      `${current?.story_id}/${current?.scenario_id} is already confirmed.`,
    );
  }
  const directory = artifactPath(
    cwd,
    state,
    'artifacts/01-requirements/examples',
  );
  const existing = existsSync(directory)
    ? readdirSync(directory).filter((name) =>
        /^US-\d{3,}-SC-\d{3,}\.md$/.test(name),
      )
    : [];
  const recordedScenarioIds = new Set(
    (state.understanding_decisions ?? [])
      .filter((decision) => decision.action === 'confirmed')
      .map((decision) => decision.scenario_id),
  );
  const unrecorded = existing.filter((name) => {
    const scenarioId = name.match(/(SC-\d{3,})\.md$/)?.[1];
    return !scenarioId || !recordedScenarioIds.has(scenarioId);
  });
  if (unrecorded.length > 0) {
    throw new Error(
      `Confirmed Scenario artifacts lack matching human decisions: ${unrecorded.join(', ')}.`,
    );
  }
}

export interface UnderstandingDecisionInput {
  action: UnderstandingDecisionAction;
  reason?: string;
  /** @deprecated Use draftIds for the complete Story acceptance set. */
  draftId?: string;
  draftIds?: string[];
}

/** Apply a human-only decision to concrete Scenario drafts or the active Story. */
export function decideUnderstanding(
  cwd: string,
  input: UnderstandingDecisionInput,
  now = new Date().toISOString(),
): WorkflowState {
  let state = requireUnderstandState(cwd);
  if (!UNDERSTANDING_ACTIONS.has(input.action)) {
    throw new Error(`Unsupported Understand decision: ${input.action}.`);
  }
  const reason = input.reason
    ? requiredText(input.reason, 'Understand decision reason')
    : undefined;
  if (input.action !== 'confirmed' && !reason) {
    throw new Error(`Understand ${input.action} requires a reason.`);
  }
  const activeStoryId = state.active_clarification_story?.story_id;
  if (!activeStoryId) {
    throw new Error('No active Story is available for an Understand decision.');
  }

  if (input.action === 'split' || input.action === 'deferred') {
    if (!reason)
      throw new Error(`Understand ${input.action} requires a reason.`);
    state = waivePendingClarification(cwd, reason, now);
    const decision: UnderstandingDecision = {
      action: input.action,
      reason,
      decided_by: 'human',
      decided_at: now,
    };
    return writeState(cwd, {
      ...state,
      understanding_decisions: [
        ...(state.understanding_decisions ?? []),
        decision,
      ],
      halted: {
        loop: 'understand',
        reason: `${input.action}: ${reason}`,
        recorded_at: now,
      },
    });
  }

  if (
    state.understand_stage !== 'scenario_review' ||
    !state.scenario_drafts?.length
  ) {
    throw new Error('No Scenario drafts are awaiting a human decision.');
  }

  if (input.action === 'continue') {
    if (!reason) throw new Error('Understand continue requires a reason.');
    const decision: UnderstandingDecision = {
      action: 'continue',
      reason,
      decided_by: 'human',
      decided_at: now,
    };
    return writeState(cwd, {
      ...state,
      understand_stage: 'tqa',
      scenario_drafts: undefined,
      understanding_decisions: [
        ...(state.understanding_decisions ?? []),
        decision,
      ],
    });
  }

  const requestedDraftIds =
    input.draftIds ?? (input.draftId ? [input.draftId] : []);
  if (requestedDraftIds.length === 0) {
    throw new Error('Scenario confirmation requires at least one draft id.');
  }
  const draftIds = requestedDraftIds.map((value, index) =>
    requiredText(value, `Scenario draft id[${index}]`, true).toUpperCase(),
  );
  if (new Set(draftIds).size !== draftIds.length) {
    throw new Error('Scenario confirmation draft ids must be unique.');
  }
  const drafts = draftIds.map((draftId) => {
    const draft = state.scenario_drafts?.find(
      (candidate) => candidate.draft_id === draftId,
    );
    if (!draft) {
      throw new Error(
        `Unknown Scenario draft ${draftId}. Available drafts: ${state.scenario_drafts?.map(({ draft_id }) => draft_id).join(', ') ?? 'none'}.`,
      );
    }
    return draft;
  });
  ensureNoConfirmedScenario(cwd, state);
  const priorScenarioNumbers = (state.understanding_decisions ?? [])
    .filter((decision) => decision.action === 'confirmed')
    .flatMap(
      (decision) =>
        decision.scenario_ids ??
        (decision.scenario_id ? [decision.scenario_id] : []),
    )
    .map((scenarioId) => Number(scenarioId.replace('SC-', '')))
    .filter(Number.isFinite);
  const firstNumber = Math.max(0, ...priorScenarioNumbers) + 1;
  const confirmed = drafts.map((draft, index): ConfirmedScenario => {
    const scenarioId = `SC-${String(firstNumber + index).padStart(3, '0')}`;
    const artifactPathValue = artifactRelativePath(
      state,
      `artifacts/01-requirements/examples/${activeStoryId}-${scenarioId}.md`,
    );
    return {
      version: 1,
      story_id: activeStoryId,
      scenario_id: scenarioId,
      source_draft_id: draft.draft_id,
      title: draft.title,
      given: draft.given,
      when: draft.when,
      then: draft.then,
      business_data: draft.business_data,
      artifact_path: artifactPathValue,
      confirmed_by: 'human',
      ...(reason ? { confirmation_reason: reason } : {}),
      confirmed_at: now,
    };
  });
  for (const scenario of confirmed) {
    const absolute = `${cwd}/${scenario.artifact_path}`;
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, confirmedScenarioMarkdown(scenario));
  }
  const scenarioIds = confirmed.map(({ scenario_id }) => scenario_id);
  const decision: UnderstandingDecision = {
    action: 'confirmed',
    ...(reason ? { reason } : {}),
    decided_by: 'human',
    decided_at: now,
    draft_ids: draftIds,
    scenario_ids: scenarioIds,
    // Keep the first ids readable by archived single-Scenario consumers during migration.
    draft_id: draftIds[0],
    scenario_id: scenarioIds[0],
  };
  return writeState(cwd, {
    ...state,
    understand_stage: 'modeling',
    modeling_stage: 'profile',
    active_clarification_story: undefined,
    confirmed_scenarios: confirmed,
    confirmed_scenario: confirmed[0],
    understanding_decisions: [
      ...(state.understanding_decisions ?? []),
      decision,
    ],
  });
}
