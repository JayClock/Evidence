import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { artifactRelativePath } from '../../../iteration/artifact-layout';
import { readState, writeState } from '../../../iteration/state-repository';
import type {
  ModelProjectionRecord,
  WorkflowState,
} from '../../../iteration/state';
import { findFiles } from '../../../iteration/artifact-inventory';
import { eightXValidationIssues } from './eight-x-validation';
import {
  candidateModelSources,
  type CandidateModelSource,
} from './candidate-model';

export interface ModelRegressionScenario {
  version: 1;
  id: string;
  title: string;
  status: 'regression' | 'holdout';
  model_refs: { entities: string[]; associations: string[] };
  given: string[];
  when: string;
  then: string[];
  business_data: string[];
  invariants: string[];
  timeline: string[];
}

interface ProjectedEntity {
  id: string;
  name: string;
  label: string;
  type: string;
  sub_type: string;
  parent?: string;
  definition: string;
}

interface ProjectedAssociation {
  id: string;
  name: string;
  label: string;
  source: string;
  target: string;
  relationship_type: string;
  cardinality: string;
  summary: string;
}

export interface CandidateModelProjection {
  model_sha256: string;
  entities: ProjectedEntity[];
  associations: ProjectedAssociation[];
  regressions: ModelRegressionScenario[];
  regression_failures: string[];
  method_failures: string[];
  mermaid: string;
  glossary: string;
  context: string;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function requiredStrings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty string array.`);
  }
  return value.map((entry, index) =>
    requiredString(entry, `${name}[${index}]`),
  );
}

function optionalStrings(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be a string array.`);
  return value.map((entry, index) =>
    requiredString(entry, `${name}[${index}]`),
  );
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`Invalid model projection JSON: ${path}.`);
  }
}

function field(content: string, name: string): string {
  return (
    new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm')
      .exec(content)?.[1]
      ?.replace(/^['"]|['"]$/g, '') ?? ''
  );
}

function blockField(content: string, name: string): string {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => line.trim() === `${name}: |`);
  if (index < 0) return field(content, name);
  const block: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (!/^\s+/.test(line)) break;
    block.push(line.trim());
  }
  return block.join(' ').trim();
}

function projectSources(sources: CandidateModelSource[]): {
  entities: ProjectedEntity[];
  associations: ProjectedAssociation[];
} {
  const entities = sources
    .filter(({ path }) => path.startsWith('.evidence/entities/'))
    .map(({ content }) => ({
      id: field(content, 'id'),
      name: field(content, 'name'),
      label: field(content, 'label') || field(content, 'name'),
      type: field(content, 'type'),
      sub_type: field(content, 'subType'),
      ...(field(content, 'parent') ? { parent: field(content, 'parent') } : {}),
      definition: blockField(content, 'description'),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const associations = sources
    .filter(({ path }) => path.startsWith('.evidence/associations/'))
    .map(({ content }) => ({
      id: field(content, 'id'),
      name: field(content, 'name'),
      label: field(content, 'label') || field(content, 'name'),
      source: field(content, 'source'),
      target: field(content, 'target'),
      relationship_type:
        field(content, 'relationshipType') || field(content, 'kind'),
      cardinality: field(content, 'cardinality'),
      summary: blockField(content, 'summary'),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { entities, associations };
}

export function readModelRegressionScenarios(
  cwd: string,
): ModelRegressionScenario[] {
  const scenarios = findFiles(`${cwd}/.evidence/scenarios`, (path) =>
    path.endsWith('.json'),
  )
    .map((path) => {
      const source = record(readJson(path), path);
      const refs = record(source.model_refs, `${path}.model_refs`);
      if (source.version !== 1) throw new Error(`${path}.version must be 1.`);
      const status = requiredString(source.status, `${path}.status`);
      if (status !== 'regression' && status !== 'holdout') {
        throw new Error(`${path}.status must be regression or holdout.`);
      }
      return {
        version: 1,
        id: requiredString(source.id, `${path}.id`),
        title: requiredString(source.title, `${path}.title`),
        status,
        model_refs: {
          entities: requiredStrings(
            refs.entities,
            `${path}.model_refs.entities`,
          ),
          associations: optionalStrings(
            refs.associations,
            `${path}.model_refs.associations`,
          ),
        },
        given: requiredStrings(source.given, `${path}.given`),
        when: requiredString(source.when, `${path}.when`),
        then: requiredStrings(source.then, `${path}.then`),
        business_data: requiredStrings(
          source.business_data,
          `${path}.business_data`,
        ),
        invariants: requiredStrings(source.invariants, `${path}.invariants`),
        timeline: requiredStrings(source.timeline, `${path}.timeline`),
      } satisfies ModelRegressionScenario;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  if (scenarios.length === 0) {
    throw new Error(
      'The canonical model has no regression or holdout scenarios.',
    );
  }
  if (new Set(scenarios.map(({ id }) => id)).size !== scenarios.length) {
    throw new Error('Canonical model regression ids must be unique.');
  }
  return scenarios;
}

function regressionFailures(
  regressions: ModelRegressionScenario[],
  entities: ProjectedEntity[],
  associations: ProjectedAssociation[],
): string[] {
  const entityIds = new Set(entities.map(({ id }) => id));
  const associationIds = new Set(associations.map(({ id }) => id));
  const failures: string[] = [];
  for (const regression of regressions) {
    for (const id of regression.model_refs.entities) {
      if (!entityIds.has(id)) {
        failures.push(
          `${regression.id} references unknown model entity id ${id}.`,
        );
      }
    }
    for (const id of regression.model_refs.associations) {
      if (!associationIds.has(id)) {
        failures.push(
          `${regression.id} references unknown model association id ${id}.`,
        );
      }
    }
  }
  return failures.sort();
}

export function validateModelRegressions(
  projection: Pick<
    CandidateModelProjection,
    'regressions' | 'entities' | 'associations'
  >,
): void {
  const failures = regressionFailures(
    projection.regressions,
    projection.entities,
    projection.associations,
  );
  if (failures.length) {
    throw new Error(`Model regression failed: ${failures.join(' ')}`);
  }
}

function escapeMermaid(value: string): string {
  return value.replaceAll('"', "'").replaceAll('\n', ' ');
}

function renderMermaid(
  entities: ProjectedEntity[],
  associations: ProjectedAssociation[],
): string {
  const nodeById = new Map(
    entities.map((entity, index) => [
      entity.id,
      `E${String(index + 1).padStart(3, '0')}`,
    ]),
  );
  const nodes = entities.map((entity) => {
    const node = nodeById.get(entity.id);
    return `  ${node}["${escapeMermaid(`${entity.label}\\n${entity.id}\\n${entity.type}/${entity.sub_type}`)}"]`;
  });
  const edges = associations.map((association) => {
    const source = nodeById.get(association.source);
    const target = nodeById.get(association.target);
    return `  ${source} -->|"${escapeMermaid(`${association.label} · ${association.relationship_type}${association.cardinality ? ` · ${association.cardinality}` : ''}`)}"| ${target}`;
  });
  return ['flowchart LR', ...nodes, ...edges, ''].join('\n');
}

function renderGlossary(
  entities: ProjectedEntity[],
  associations: ProjectedAssociation[],
): string {
  const concepts = entities.map(
    (entity) => `## ${entity.label} (${entity.id})

- Name: ${entity.name}
- Type: ${entity.type}/${entity.sub_type}
${entity.parent ? `- Parent: ${entity.parent}\n` : ''}- Definition: ${entity.definition || '（模型尚未提供定义）'}`,
  );
  const relationships = associations.map(
    (association) => `## ${association.label} (${association.id})

- Name: ${association.name}
- From: ${association.source}
- To: ${association.target}
- Semantics: ${association.relationship_type || 'association'}
- Cardinality: ${association.cardinality || 'unspecified'}
- Summary: ${association.summary || '（模型尚未提供摘要）'}`,
  );
  return `# Generated Model Glossary

> 此文件由 .evidence 与候选补丁确定性生成，不是第二份权威模型。

# Concepts

${concepts.join('\n\n')}

# Relationships

${relationships.join('\n\n')}
`;
}

function projectionHash(
  sources: CandidateModelSource[],
  regressions: ModelRegressionScenario[],
  currentExpansion: unknown,
): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify({ sources, regressions, currentExpansion }))
    .digest('hex')}`;
}

export function projectCandidateModel(
  cwd: string,
  state = readState(cwd),
): CandidateModelProjection {
  if (!state.confirmed_scenario || !state.model_expansion_path) {
    throw new Error('A confirmed Scenario and model expansion are required.');
  }
  const sources = candidateModelSources(
    cwd,
    state.model_change_proposal?.operations ?? [],
  );
  const regressions = readModelRegressionScenarios(cwd);
  const projected = projectSources(sources);
  const currentExpansion = readJson(`${cwd}/${state.model_expansion_path}`);
  const failures = regressionFailures(
    regressions,
    projected.entities,
    projected.associations,
  );
  const methodFailures = state.modeling_profile
    ? eightXValidationIssues(state.modeling_profile, sources)
    : ['候选模型缺少人类确认的建模 Profile。'];
  const context = `${JSON.stringify(
    {
      version: 1,
      model_sha256: projectionHash(sources, regressions, currentExpansion),
      current_scenario: state.confirmed_scenario,
      current_expansion: currentExpansion,
      regression_scenarios: regressions,
      regression_failures: failures,
      method_failures: methodFailures,
    },
    null,
    2,
  )}\n`;
  const modelSha = projectionHash(sources, regressions, currentExpansion);
  return {
    model_sha256: modelSha,
    entities: projected.entities,
    associations: projected.associations,
    regressions,
    regression_failures: failures,
    method_failures: methodFailures,
    mermaid: renderMermaid(projected.entities, projected.associations),
    glossary: renderGlossary(projected.entities, projected.associations),
    context,
  };
}

/** Generate disposable challenge views without changing the canonical model. */
export function prepareModelProjection(
  cwd: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = readState(cwd);
  if (
    state.workflow_version !== 5 ||
    state.loop !== 'understand' ||
    state.modeling_stage !== 'candidate_ready'
  ) {
    throw new Error('A candidate-ready v5 model is required for projection.');
  }
  const projection = projectCandidateModel(cwd, state);
  if (
    state.model_projection?.model_sha256 === projection.model_sha256 &&
    [
      state.model_projection.mermaid_path,
      state.model_projection.glossary_path,
      state.model_projection.context_path,
    ].every((path) => existsSync(`${cwd}/${path}`))
  ) {
    return state;
  }
  const root = 'artifacts/02-domain-model/projections';
  const mermaidPath = artifactRelativePath(state, `${root}/model.mmd`);
  const glossaryPath = artifactRelativePath(state, `${root}/glossary.md`);
  const contextPath = artifactRelativePath(state, `${root}/model-context.json`);
  for (const [path, content] of [
    [mermaidPath, projection.mermaid],
    [glossaryPath, projection.glossary],
    [contextPath, projection.context],
  ]) {
    const absolute = `${cwd}/${path}`;
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  const recordValue: ModelProjectionRecord = {
    version: 1,
    model_sha256: projection.model_sha256,
    mermaid_path: mermaidPath,
    glossary_path: glossaryPath,
    context_path: contextPath,
    regression_ids: projection.regressions.map(({ id }) => id),
    regression_failures: projection.regression_failures,
    method_failures: projection.method_failures,
    generated_at: now,
  };
  return writeState(cwd, { ...state, model_projection: recordValue });
}
