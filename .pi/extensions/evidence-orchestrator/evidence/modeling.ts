import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { artifactRelativePath } from '../iteration/artifact-layout';
import { readState, writeState } from '../iteration/state-repository';
import type {
  ConfirmedModelingProfile,
  ModelChangeProposal,
  ModelingMethod,
  ModelingProfileProposal,
  ModelingSubject,
  ModelOperation,
  WorkflowState,
} from '../iteration/state';
import { findFiles } from './artifact-index';
import { validateEightXModel } from './eight-x';

const SUBJECTS = new Set<ModelingSubject>(['business', 'domain', 'tool']);
const METHODS = new Set<ModelingMethod>([
  'none',
  'object',
  'event',
  'four_color',
  'eight_x_flow',
  'algorithmic',
]);
const MODEL_PATH =
  /^\.evidence\/(entities|associations)\/([a-z0-9][a-z0-9_-]*)\.yaml$/;
const MODEL_ID = /^[a-z0-9][a-z0-9_-]*$/;

export interface ModelingProfileInput {
  subject: ModelingSubject;
  method: ModelingMethod;
  modelChangeRequired: boolean | 'unknown';
  reason: string;
}

export interface ConfirmModelingProfileInput {
  reason: string;
  subject?: ModelingSubject;
  method?: ModelingMethod;
  modelChangeRequired?: boolean;
}

export interface ModelExpansionInput {
  reason: string;
  modelRefs: { entities: string[]; associations: string[] };
  given: { entities: string[]; relationships: string[] };
  when: string;
  then: {
    createdEntities: string[];
    changedEntities: string[];
    createdRelationships: string[];
    removedRelationships: string[];
  };
  invariants: string[];
  timeline: string[];
  operations: ModelOperation[];
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  return normalized;
}

function strings(value: string[], name: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(
      `${name} must be ${allowEmpty ? 'an' : 'a non-empty'} array.`,
    );
  }
  const normalized = value.map((entry, index) =>
    requiredText(entry, `${name}[${index}]`),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} must not contain duplicates.`);
  }
  return normalized;
}

function requireModelingState(cwd: string): WorkflowState {
  const state = readState(cwd);
  if (
    state.loop !== 'understand' ||
    state.understand_stage !== 'modeling' ||
    !state.confirmed_scenario
  ) {
    throw new Error(
      'Modeling is only available for a human-confirmed Scenario in the v5 Understand modeling stage.',
    );
  }
  if (state.halted)
    throw new Error(`Iteration is halted: ${state.halted.reason}`);
  return state;
}

function validateProfile(
  subject: ModelingSubject,
  method: ModelingMethod,
  modelChangeRequired: boolean | 'unknown',
): void {
  if (!SUBJECTS.has(subject))
    throw new Error(`Unsupported modeling subject: ${subject}.`);
  if (!METHODS.has(method))
    throw new Error(`Unsupported modeling method: ${method}.`);
  if (![true, false, 'unknown'].includes(modelChangeRequired)) {
    throw new Error(
      `Unsupported model-change requirement: ${String(modelChangeRequired)}.`,
    );
  }
  if (method === 'eight_x_flow' && subject !== 'business') {
    throw new Error('eight_x_flow is only valid for a business system.');
  }
  if (method === 'none' && subject !== 'tool') {
    throw new Error(
      'method=none is only valid for a tool or glue-code subject.',
    );
  }
}

export function proposeModelingProfile(
  cwd: string,
  input: ModelingProfileInput,
  now = new Date().toISOString(),
): WorkflowState {
  const state = requireModelingState(cwd);
  if (state.modeling_stage !== 'profile') {
    throw new Error(
      `A modeling Profile cannot be proposed in ${state.modeling_stage ?? 'unset'}.`,
    );
  }
  validateProfile(input.subject, input.method, input.modelChangeRequired);
  const proposal: ModelingProfileProposal = {
    version: 1,
    subject: input.subject,
    method: input.method,
    model_change_required: input.modelChangeRequired,
    reason: requiredText(input.reason, 'Modeling Profile reason'),
    proposed_at: now,
  };
  return writeState(cwd, {
    ...state,
    modeling_stage: 'profile_review',
    modeling_profile_proposal: proposal,
  });
}

export function confirmModelingProfile(
  cwd: string,
  input: ConfirmModelingProfileInput,
  now = new Date().toISOString(),
): WorkflowState {
  const state = requireModelingState(cwd);
  if (state.modeling_stage !== 'profile_review') {
    throw new Error('No modeling Profile is awaiting a human decision.');
  }
  const proposal = state.modeling_profile_proposal;
  if (!proposal)
    throw new Error('The AI modeling Profile proposal is missing.');
  const subject = input.subject ?? proposal.subject;
  const method = input.method ?? proposal.method;
  const modelChangeRequired =
    input.modelChangeRequired ??
    (proposal.model_change_required === 'unknown'
      ? undefined
      : proposal.model_change_required);
  if (modelChangeRequired === undefined) {
    throw new Error(
      'The proposed model-change requirement is unknown; the human must explicitly set true or false.',
    );
  }
  validateProfile(subject, method, modelChangeRequired);
  const profile: ConfirmedModelingProfile = {
    version: 1,
    subject,
    method,
    model_change_required: modelChangeRequired,
    reason: requiredText(input.reason, 'Modeling Profile confirmation reason'),
    confirmed_by: 'human',
    confirmed_at: now,
    proposal,
  };
  return writeState(cwd, {
    ...state,
    modeling_stage: 'expansion',
    modeling_profile_proposal: undefined,
    modeling_profile: profile,
  });
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'Model proposals require a Git repository with an initial commit.',
    );
  }
}

function digest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function frontmatterValue(content: string, key: string): string | undefined {
  return new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm')
    .exec(content)?.[1]
    ?.replace(/^['"]|['"]$/g, '');
}

function currentModel(cwd: string): Map<string, string> {
  const files = [
    ...findFiles(`${cwd}/.evidence/entities`, (path) => path.endsWith('.yaml')),
    ...findFiles(`${cwd}/.evidence/associations`, (path) =>
      path.endsWith('.yaml'),
    ),
  ];
  return new Map(
    files
      .map((path) => path.slice(cwd.length + 1))
      .sort()
      .map((path) => [path, readFileSync(`${cwd}/${path}`, 'utf8')]),
  );
}

interface ModelIndex {
  entityIds: Set<string>;
  associationIds: Set<string>;
}

function validateModel(model: Map<string, string>): ModelIndex {
  const entityIds = new Set<string>();
  const associationIds = new Set<string>();
  const allIds = new Set<string>();
  for (const [path, content] of model) {
    const matched = MODEL_PATH.exec(path);
    if (!matched) throw new Error(`Unsupported canonical model path: ${path}.`);
    const id = frontmatterValue(content, 'id');
    if (!id || !MODEL_ID.test(id)) {
      throw new Error(`Model file ${path} must declare a stable lowercase id.`);
    }
    if (allIds.has(id))
      throw new Error(`Candidate model contains duplicate id ${id}.`);
    allIds.add(id);
    if (matched[1] === 'entities') entityIds.add(id);
    else associationIds.add(id);
  }
  if (entityIds.size === 0)
    throw new Error('The candidate model has no entities.');
  for (const [path, content] of model) {
    if (!path.startsWith('.evidence/associations/')) continue;
    const source = frontmatterValue(content, 'source');
    const target = frontmatterValue(content, 'target');
    if (
      !source ||
      !target ||
      !entityIds.has(source) ||
      !entityIds.has(target)
    ) {
      throw new Error(
        `Candidate association ${path} must reference existing source and target entity ids.`,
      );
    }
  }
  return { entityIds, associationIds };
}

function simulateOperations(
  model: Map<string, string>,
  operations: ModelOperation[],
): { model: Map<string, string>; changedPaths: string[]; index: ModelIndex } {
  const next = new Map(model);
  const changedPaths = new Set<string>();
  for (const [index, operation] of operations.entries()) {
    if (!['add', 'update', 'remove'].includes(operation.action)) {
      throw new Error(`operations[${index}].action is unsupported.`);
    }
    if (!['entity', 'association'].includes(operation.kind)) {
      throw new Error(`operations[${index}].kind is unsupported.`);
    }
    if (!MODEL_ID.test(operation.id)) {
      throw new Error(`operations[${index}].id is invalid: ${operation.id}.`);
    }
    const expectedPath = `.evidence/${operation.kind === 'entity' ? 'entities' : 'associations'}/${operation.id}.yaml`;
    if (operation.path !== expectedPath || !MODEL_PATH.test(operation.path)) {
      throw new Error(`operations[${index}].path must be ${expectedPath}.`);
    }
    if (changedPaths.has(operation.path)) {
      throw new Error(
        `Model proposal changes ${operation.path} more than once.`,
      );
    }
    changedPaths.add(operation.path);
    const existing = next.get(operation.path);
    if (operation.action === 'add') {
      if (existing !== undefined)
        throw new Error(`Cannot add existing model path ${operation.path}.`);
      if (operation.expected_sha256 !== undefined) {
        throw new Error(
          `Add operation ${operation.path} must not declare expected_sha256.`,
        );
      }
      const content = requiredText(
        operation.content ?? '',
        `${operation.path}.content`,
      );
      if (frontmatterValue(content, 'id') !== operation.id) {
        throw new Error(
          `${operation.path}.content id must be ${operation.id}.`,
        );
      }
      next.set(operation.path, `${content.trim()}\n`);
      continue;
    }
    if (existing === undefined) {
      throw new Error(
        `Cannot ${operation.action} missing model path ${operation.path}.`,
      );
    }
    if (operation.expected_sha256 !== digest(existing)) {
      throw new Error(
        `Model path ${operation.path} changed after the proposal baseline.`,
      );
    }
    if (operation.action === 'remove') {
      if (operation.content !== undefined) {
        throw new Error(
          `Remove operation ${operation.path} must not contain content.`,
        );
      }
      next.delete(operation.path);
      continue;
    }
    const content = requiredText(
      operation.content ?? '',
      `${operation.path}.content`,
    );
    if (frontmatterValue(content, 'id') !== operation.id) {
      throw new Error(`${operation.path}.content id must be ${operation.id}.`);
    }
    next.set(operation.path, `${content.trim()}\n`);
  }
  return {
    model: next,
    changedPaths: [...changedPaths].sort(),
    index: validateModel(next),
  };
}

export interface CandidateModelSource {
  path: string;
  content: string;
}

/** Return the canonical model with a structured proposal applied in memory only. */
export function candidateModelSources(
  cwd: string,
  operations: ModelOperation[] = [],
): CandidateModelSource[] {
  return [...simulateOperations(currentModel(cwd), operations).model]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, content]) => ({ path, content }));
}

function validateModelRefs(
  profile: ConfirmedModelingProfile,
  refs: ModelExpansionInput['modelRefs'],
  index: ModelIndex,
): { entities: string[]; associations: string[] } {
  const entities = strings(
    refs.entities,
    'modelRefs.entities',
    profile.method === 'none',
  );
  const associations = strings(refs.associations, 'modelRefs.associations');
  for (const id of entities) {
    if (!index.entityIds.has(id))
      throw new Error(`Unknown candidate model entity id: ${id}.`);
  }
  for (const id of associations) {
    if (!index.associationIds.has(id)) {
      throw new Error(`Unknown candidate model association id: ${id}.`);
    }
  }
  if (profile.method === 'none' && (entities.length || associations.length)) {
    throw new Error('method=none must not claim canonical model references.');
  }
  return { entities, associations };
}

export function recordModelAnalysis(
  cwd: string,
  input: ModelExpansionInput,
  now = new Date().toISOString(),
): WorkflowState {
  const state = requireModelingState(cwd);
  if (state.modeling_stage !== 'expansion' || !state.modeling_profile) {
    throw new Error(
      'A human-confirmed modeling Profile is required before model expansion.',
    );
  }
  if (git(cwd, ['status', '--porcelain=v1', '--', '.evidence'])) {
    throw new Error(
      'Canonical .evidence files must be clean before creating a candidate proposal.',
    );
  }
  const profile = state.modeling_profile;
  if (profile.model_change_required !== input.operations.length > 0) {
    throw new Error(
      `Model operations do not match the human-confirmed model_change_required=${profile.model_change_required}.`,
    );
  }
  const baseline = git(cwd, ['rev-parse', '--verify', 'HEAD']);
  const simulated = simulateOperations(currentModel(cwd), input.operations);
  validateEightXModel(
    profile,
    [...simulated.model]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => ({ path, content })),
  );
  const modelRefs = validateModelRefs(
    profile,
    input.modelRefs,
    simulated.index,
  );
  const scenario = state.confirmed_scenario;
  if (!scenario) throw new Error('The confirmed Scenario is missing.');
  const proposalPath = input.operations.length
    ? artifactRelativePath(
        state,
        'artifacts/02-domain-model/model-change-proposal.json',
      )
    : undefined;
  const expansionPath = artifactRelativePath(
    state,
    `artifacts/02-domain-model/model-expansions/${scenario.story_id}-${scenario.scenario_id}.json`,
  );
  const expansion = {
    version: 2,
    work_item: {
      story_id: scenario.story_id,
      scenario_id: scenario.scenario_id,
    },
    source_scenario: scenario.artifact_path,
    modeling_profile: profile,
    model_refs: modelRefs,
    given: {
      entities: strings(input.given.entities, 'given.entities'),
      relationships: strings(input.given.relationships, 'given.relationships'),
    },
    when: { command: requiredText(input.when, 'when') },
    then: {
      created_entities: strings(
        input.then.createdEntities,
        'then.createdEntities',
      ),
      changed_entities: strings(
        input.then.changedEntities,
        'then.changedEntities',
      ),
      created_relationships: strings(
        input.then.createdRelationships,
        'then.createdRelationships',
      ),
      removed_relationships: strings(
        input.then.removedRelationships,
        'then.removedRelationships',
      ),
    },
    invariants: strings(input.invariants, 'invariants', false),
    timeline: strings(input.timeline, 'timeline', false),
    analysis_reason: requiredText(input.reason, 'Model analysis reason'),
    model_change_proposal: proposalPath ?? null,
    git_baseline: baseline,
  };
  const absoluteExpansion = `${cwd}/${expansionPath}`;
  mkdirSync(dirname(absoluteExpansion), { recursive: true });
  writeFileSync(absoluteExpansion, `${JSON.stringify(expansion, null, 2)}\n`);

  let proposal: ModelChangeProposal | undefined;
  if (proposalPath) {
    proposal = {
      version: 1,
      story_id: scenario.story_id,
      scenario_id: scenario.scenario_id,
      git_baseline: baseline,
      reason: expansion.analysis_reason,
      operations: input.operations,
      artifact_path: proposalPath,
      proposed_at: now,
    };
    const absoluteProposal = `${cwd}/${proposalPath}`;
    mkdirSync(dirname(absoluteProposal), { recursive: true });
    writeFileSync(absoluteProposal, `${JSON.stringify(proposal, null, 2)}\n`);
  }

  return writeState(cwd, {
    ...state,
    modeling_stage: 'candidate_ready',
    model_expansion_path: expansionPath,
    model_git_baseline: baseline,
    ...(proposal ? { model_change_proposal: proposal } : {}),
  });
}

/** Apply only a validated structured proposal. This is intentionally not exposed in Understand. */
export function applyModelChangeProposal(
  cwd: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = readState(cwd);
  const proposal = state.model_change_proposal;
  if (!proposal) throw new Error('There is no model-change proposal to apply.');
  const head = git(cwd, ['rev-parse', '--verify', 'HEAD']);
  if (head !== proposal.git_baseline || state.model_git_baseline !== head) {
    throw new Error(
      'The model proposal and current Git baseline do not match.',
    );
  }
  const simulated = simulateOperations(currentModel(cwd), proposal.operations);
  for (const operation of proposal.operations) {
    const absolute = `${cwd}/${operation.path}`;
    if (operation.action === 'remove') unlinkSync(absolute);
    else {
      mkdirSync(dirname(absolute), { recursive: true });
      const content = simulated.model.get(operation.path);
      if (!content)
        throw new Error(`Simulated content is missing for ${operation.path}.`);
      writeFileSync(absolute, content);
    }
  }
  validateModel(currentModel(cwd));
  return writeState(cwd, {
    ...state,
    model_change_application: {
      git_baseline: head,
      changed_paths: simulated.changedPaths,
      applied_at: now,
    },
  });
}

export function modelContentSha256(content: string): string {
  return digest(content);
}
