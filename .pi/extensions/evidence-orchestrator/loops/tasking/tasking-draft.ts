import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findFiles } from '../../iteration/artifact-inventory';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import { transitionLoopState } from '../../iteration/transition-graph';
import { readState, writeState } from '../../iteration/state-repository';
import type {
  TaskingCandidate,
  TaskingImplementationTask,
  TaskingTestItem,
  TestProcessRuntime,
  TestProcessSelection,
  WorkflowState,
} from '../../iteration/state';
import {
  catalogTestProcessDirectory,
  matchingTestProcesses,
  materializeFocusedCommands,
  materializeQualityGates,
  materializedProcessSha256,
  testProcessDefinitionSha256,
  type TestProcessDefinition,
} from '../../capabilities/test-process/catalog';
import {
  assertProjectHasTarget,
  assertTestProject,
  nxProject,
  readNxProjectCatalog,
  type NxProjectCatalog,
} from '../../capabilities/test-process/project-catalog';

export interface TaskingRuntimeInput {
  id: string;
  runtime: TestProcessRuntime;
  functionalContexts: string[];
  technicalBoundaries: string[];
  projectIds?: string[];
}

export interface TaskingTestInput {
  id: string;
  quadrant: 'Q1' | 'Q2';
  intent: string;
  runtimePlanId: string;
  stepId: string;
  projectId?: string;
  testFilter: string;
  supportedBy: string[];
  scenarioIds: string[];
  scenarioOutcome?: string;
  businessData: string[];
  modelRefs: { entities: string[]; associations: string[] };
}

export interface TaskingTaskInput {
  id: string;
  description: string;
  testIds: string[];
  dependsOn: string[];
}

export interface TaskingDraftInput {
  runtimes: TaskingRuntimeInput[];
  tests: TaskingTestInput[];
  tasks: TaskingTaskInput[];
}

interface ResolvedRuntime {
  input: TaskingRuntimeInput & { projectIds: string[] };
  path: string;
  definition: TestProcessDefinition;
  definitionSha256: string;
  selectedStepIds: string[];
  projectCatalog?: NxProjectCatalog;
}

interface FinalizedRuntime extends ResolvedRuntime {
  selection: TestProcessSelection;
}

export type ProjectCatalogLoader = typeof readNxProjectCatalog;

class TestProcessGapError extends Error {}

const RUNTIME_PLAN_ID = /^RUNTIME-\d{3,}$/;
const TEST_ID = /^TEST-\d{3,}$/;
const TASK_ID = /^TASK-\d{3,}$/;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  return normalized;
}

function unique(values: string[], name: string, allowEmpty = false): string[] {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new Error(
      `${name} must be ${allowEmpty ? 'a' : 'a non-empty'} array.`,
    );
  }
  const normalized = values.map((value, index) =>
    required(value, `${name}[${index}]`),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} must contain unique values.`);
  }
  return normalized;
}

function assertTaskingState(state: WorkflowState): void {
  const noModelImpact =
    state.modeling_profile?.method === 'none' &&
    state.modeling_profile.model_change_required === false &&
    !state.model_change_proposal;
  const reviewedModel =
    state.model_challenges?.at(-1)?.outcome === 'pass' &&
    state.model_decisions?.at(-1)?.action === 'confirm';
  if (
    state.loop !== 'tasking' ||
    !state.confirmed_scenarios?.length ||
    state.modeling_stage !== 'model_confirmed' ||
    (!noModelImpact && !reviewedModel)
  ) {
    throw new Error(
      'Tasking requires one confirmed Story Scenario Set and confirmed modeling evidence.',
    );
  }
  if (state.tasking_stage === 'desk_check') {
    throw new Error(
      'The current Tasking candidate awaits a human Desk Check before regeneration.',
    );
  }
}

function routeKnowledgeGap(
  cwd: string,
  state: WorkflowState,
  kind: 'architecture_gap' | 'process_gap',
  reason: string,
  now: string,
): WorkflowState {
  const routed = transitionLoopState(
    state,
    {
      to: 'tasking',
      feedback: {
        target: kind === 'architecture_gap' ? 'architecture' : 'test_process',
        reason,
        decided_by: 'system',
      },
    },
    now,
  );
  return writeState(cwd, {
    ...routed,
    tasking_stage: 'knowledge_gap',
    tasking_candidate: undefined,
    tasking_gap: { kind, reason, recorded_at: now },
  });
}

function resolveRuntimes(
  cwd: string,
  state: WorkflowState,
  inputs: TaskingRuntimeInput[],
  now: string,
  loadProjectCatalog: ProjectCatalogLoader,
): ResolvedRuntime[] | WorkflowState {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('Tasking requires at least one owning runtime plan.');
  }
  const ids = inputs.map(({ id }) => id);
  if (
    ids.some((id) => !RUNTIME_PLAN_ID.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error('Runtime plan ids must be unique RUNTIME-xxx values.');
  }
  const resolved: ResolvedRuntime[] = [];
  for (const input of inputs) {
    const functionalContexts = unique(
      input.functionalContexts,
      `${input.id}.functionalContexts`,
    );
    const technicalBoundaries = unique(
      input.technicalBoundaries,
      `${input.id}.technicalBoundaries`,
    );
    const projectIds = unique(
      input.projectIds ?? [],
      `${input.id}.projectIds`,
      true,
    ).sort();
    const candidates = matchingTestProcesses(
      cwd,
      catalogTestProcessDirectory(cwd),
      input.runtime,
      functionalContexts,
      technicalBoundaries,
    );
    if (candidates.length !== 1) {
      const reason =
        candidates.length === 0
          ? `No v3 test process uniquely covers ${input.runtime}/${functionalContexts.join(',')} at ${technicalBoundaries.join(',')}.`
          : `Multiple v3 test processes cover ${input.runtime}/${functionalContexts.join(',')} at ${technicalBoundaries.join(',')}: ${candidates.map(({ definition }) => definition.id).join(', ')}.`;
      return routeKnowledgeGap(cwd, state, 'process_gap', reason, now);
    }
    const candidate = candidates[0];
    if (!candidate) {
      throw new Error(`Matched process disappeared for ${input.id}.`);
    }
    const selectedSteps = candidate.definition.steps.filter((step) =>
      step.functional_contexts.some((context) =>
        functionalContexts.includes(context),
      ),
    );
    if (
      !selectedSteps.some(({ quadrant }) => quadrant === 'Q1') ||
      !selectedSteps.some(({ quadrant }) => quadrant === 'Q2')
    ) {
      return routeKnowledgeGap(
        cwd,
        state,
        'process_gap',
        `${candidate.definition.id} has no applicable Q1/Q2 step chain for ${functionalContexts.join(',')}.`,
        now,
      );
    }
    const requiresProjects =
      selectedSteps.some(({ focused_command }) =>
        focused_command.allowed_variables.includes('project'),
      ) ||
      candidate.definition.quality_gates.some(
        ({ scope }) => scope !== 'process',
      );
    if (requiresProjects && input.runtime !== 'typescript') {
      return routeKnowledgeGap(
        cwd,
        state,
        'process_gap',
        `${candidate.definition.id} uses Nx project gates outside the TypeScript runtime.`,
        now,
      );
    }
    if (requiresProjects && projectIds.length === 0) {
      return routeKnowledgeGap(
        cwd,
        state,
        'process_gap',
        `${input.id} must declare planned Nx projectIds for ${candidate.definition.id}.`,
        now,
      );
    }
    if (!requiresProjects && projectIds.length > 0) {
      throw new Error(
        `${input.id}.projectIds must be omitted for a process without project variables.`,
      );
    }
    let projectCatalog: NxProjectCatalog | undefined;
    if (requiresProjects) {
      try {
        projectCatalog = loadProjectCatalog(cwd, projectIds);
        for (const projectId of projectIds) {
          const project = nxProject(projectCatalog, projectId);
          if (project.root === '.') {
            throw new Error(
              `Workspace-root Nx project ${project.name} cannot be planned for product Pairing.`,
            );
          }
        }
      } catch (error) {
        return routeKnowledgeGap(
          cwd,
          state,
          'process_gap',
          error instanceof Error ? error.message : String(error),
          now,
        );
      }
    }
    const definitionPath = join(cwd, candidate.path);
    resolved.push({
      input: {
        ...input,
        functionalContexts,
        technicalBoundaries,
        projectIds,
      },
      path: candidate.path,
      definition: candidate.definition,
      definitionSha256: testProcessDefinitionSha256(definitionPath),
      selectedStepIds: selectedSteps.map(({ id }) => id),
      ...(projectCatalog ? { projectCatalog } : {}),
    });
  }
  const processIds = resolved.map(({ definition }) => definition.id);
  if (new Set(processIds).size !== processIds.length) {
    throw new Error(
      'Combine capabilities and boundaries that resolve to the same process into one runtime plan.',
    );
  }
  const hasRust = resolved.some(({ input }) => input.runtime === 'rust');
  const hasNest = resolved.some(({ input }) =>
    input.technicalBoundaries.some((boundary) => boundary.startsWith('nest-')),
  );
  if (hasRust && hasNest) {
    return routeKnowledgeGap(
      cwd,
      state,
      'architecture_gap',
      'One Scenario must not mix the Rust and Nest server tracks.',
      now,
    );
  }
  return resolved;
}

function expansionModelRefs(
  cwd: string,
  state: WorkflowState,
): { entities: string[]; associations: string[] } {
  if (!state.model_expansion_path) {
    throw new Error('Tasking has no confirmed model expansion.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      readFileSync(join(cwd, state.model_expansion_path), 'utf8'),
    ) as unknown;
  } catch {
    throw new Error('The confirmed model expansion is not valid JSON.');
  }
  const source = parsed as {
    model_refs?: { entities?: unknown; associations?: unknown };
  };
  const entities = source.model_refs?.entities;
  const associations = source.model_refs?.associations;
  if (
    !Array.isArray(entities) ||
    !entities.every((value) => typeof value === 'string') ||
    !Array.isArray(associations) ||
    !associations.every((value) => typeof value === 'string')
  ) {
    throw new Error('The confirmed model expansion has invalid model_refs.');
  }
  return { entities, associations };
}

function normalizeTests(
  cwd: string,
  state: WorkflowState,
  inputs: TaskingTestInput[],
  runtimes: ResolvedRuntime[],
): TaskingTestItem[] {
  const scenarios = state.confirmed_scenarios ?? [];
  if (scenarios.length === 0)
    throw new Error('Tasking has no confirmed Scenario Set.');
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('Tasking requires a natural-language test list.');
  }
  const ids = inputs.map(({ id }) => id);
  if (ids.some((id) => !TEST_ID.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error('Test ids must be unique TEST-xxx values.');
  }
  const byRuntime = new Map(
    runtimes.map((runtime) => [runtime.input.id, runtime]),
  );
  const expansionRefs = expansionModelRefs(cwd, state);
  const allowedEntities = new Set(expansionRefs.entities);
  const allowedAssociations = new Set(expansionRefs.associations);
  const tests = inputs.map((input) => {
    const runtime = byRuntime.get(input.runtimePlanId);
    if (!runtime)
      throw new Error(`${input.id} references an unknown runtime plan.`);
    const step = runtime.definition.steps.find(({ id }) => id === input.stepId);
    if (
      !step ||
      step.quadrant !== input.quadrant ||
      !step.functional_contexts.some((context) =>
        runtime.input.functionalContexts.includes(context),
      )
    ) {
      throw new Error(
        `${input.id} must reference an applicable ${input.quadrant} step in its selected process.`,
      );
    }
    required(input.testFilter, `${input.id}.testFilter`);
    const usesProject =
      step.focused_command.allowed_variables.includes('project');
    const projectId = input.projectId?.trim() || undefined;
    if (usesProject && !projectId) {
      throw new Error(
        `${input.id}.projectId is required by ${runtime.definition.id}/${step.id}.`,
      );
    }
    if (!usesProject && projectId) {
      throw new Error(
        `${input.id}.projectId must be omitted when the focused command has no project variable.`,
      );
    }
    if (projectId) {
      if (
        !runtime.input.projectIds.includes(projectId) ||
        !runtime.projectCatalog
      ) {
        throw new Error(
          `${input.id}.projectId must belong to ${runtime.input.id}.projectIds.`,
        );
      }
      try {
        assertTestProject(
          runtime.projectCatalog,
          projectId,
          step.nearest_test.roots,
        );
      } catch (error) {
        throw new TestProcessGapError(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    const normalizedScenarioIds = unique(
      input.scenarioIds,
      `${input.id}.scenarioIds`,
    );
    const referencedScenarios = normalizedScenarioIds.map((scenarioId) => {
      const scenario = scenarios.find(
        ({ scenario_id }) => scenario_id === scenarioId,
      );
      if (!scenario) {
        throw new Error(
          `${input.id} references an unconfirmed Scenario ${scenarioId}.`,
        );
      }
      return scenario;
    });
    const businessData = unique(input.businessData, `${input.id}.businessData`);
    if (
      !input.modelRefs ||
      !Array.isArray(input.modelRefs.entities) ||
      !Array.isArray(input.modelRefs.associations)
    ) {
      throw new Error(
        `${input.id}.modelRefs must contain entity and association arrays.`,
      );
    }
    const modelRefs = {
      entities: unique(
        input.modelRefs.entities,
        `${input.id}.modelRefs.entities`,
        true,
      ),
      associations: unique(
        input.modelRefs.associations,
        `${input.id}.modelRefs.associations`,
        true,
      ),
    };
    if (
      modelRefs.entities.some((id) => !allowedEntities.has(id)) ||
      modelRefs.associations.some((id) => !allowedAssociations.has(id))
    ) {
      throw new Error(
        `${input.id} contains model references outside the confirmed expansion.`,
      );
    }
    if (
      state.modeling_profile?.method !== 'none' &&
      modelRefs.entities.length + modelRefs.associations.length === 0
    ) {
      throw new Error(`${input.id} must trace to a confirmed model fact.`);
    }
    const allowedBusinessData = new Set(
      referencedScenarios.flatMap(({ business_data }) => business_data),
    );
    if (!businessData.every((datum) => allowedBusinessData.has(datum))) {
      throw new Error(
        `${input.id} contains data outside its confirmed Scenarios.`,
      );
    }
    const outcome = input.scenarioOutcome?.trim();
    if (
      outcome &&
      !referencedScenarios.some(({ then }) => then.includes(outcome))
    ) {
      throw new Error(
        `${input.id} contains an outcome outside its confirmed Scenarios.`,
      );
    }
    if (
      input.quadrant === 'Q2' &&
      (!outcome || normalizedScenarioIds.length !== 1)
    ) {
      throw new Error(
        `${input.id} Q2 requires one exact outcome from exactly one confirmed Scenario.`,
      );
    }
    return {
      id: input.id,
      quadrant: input.quadrant,
      intent: required(input.intent, `${input.id}.intent`),
      runtime_plan_id: input.runtimePlanId,
      process_id: runtime.definition.id,
      step_id: input.stepId,
      ...(projectId ? { project_id: projectId } : {}),
      supported_by: unique(input.supportedBy, `${input.id}.supportedBy`, true),
      scenario_ids: normalizedScenarioIds,
      ...(outcome ? { scenario_outcome: outcome } : {}),
      business_data: businessData,
      model_refs: modelRefs,
    } satisfies TaskingTestItem;
  });
  if (
    !tests.some(({ quadrant }) => quadrant === 'Q1') ||
    !tests.some(({ quadrant }) => quadrant === 'Q2')
  ) {
    throw new Error(
      'The test list must include supporting Q1 and acceptance Q2 tests.',
    );
  }
  const q1Ids = new Set(
    tests.filter(({ quadrant }) => quadrant === 'Q1').map(({ id }) => id),
  );
  for (const test of tests) {
    if (test.quadrant === 'Q1' && test.supported_by.length > 0) {
      throw new Error(`${test.id} Q1 must not declare supported_by.`);
    }
    if (
      test.quadrant === 'Q2' &&
      (test.supported_by.length === 0 ||
        !test.supported_by.every((id) => q1Ids.has(id)))
    ) {
      throw new Error(
        `${test.id} Q2 must be supported by one or more Q1 tests.`,
      );
    }
  }
  const supportedQ1 = new Set(
    tests
      .filter(({ quadrant }) => quadrant === 'Q2')
      .flatMap(({ supported_by }) => supported_by),
  );
  if (
    tests.some(({ id, quadrant }) => quadrant === 'Q1' && !supportedQ1.has(id))
  ) {
    throw new Error(
      'Every Q1 test must support at least one Q2 acceptance test.',
    );
  }
  for (const scenario of scenarios) {
    for (const outcome of scenario.then) {
      if (
        !tests.some(
          (test) =>
            test.quadrant === 'Q2' &&
            test.scenario_ids.includes(scenario.scenario_id) &&
            test.scenario_outcome === outcome,
        )
      ) {
        throw new Error(
          `Confirmed outcome ${scenario.scenario_id}/${outcome} has no Q2 acceptance test.`,
        );
      }
    }
  }
  for (const runtime of runtimes) {
    for (const step of runtime.definition.steps) {
      const applicable = step.functional_contexts.some((context) =>
        runtime.input.functionalContexts.includes(context),
      );
      if (
        applicable &&
        !tests.some(
          ({ process_id, step_id }) =>
            process_id === runtime.definition.id && step_id === step.id,
        )
      ) {
        throw new Error(
          `Selected process step ${runtime.definition.id}/${step.id} has no test-list item.`,
        );
      }
    }
  }
  if (
    new Set(tests.map(({ intent }) => intent.toLowerCase())).size !==
    tests.length
  ) {
    throw new Error('The test list contains duplicate intent.');
  }
  const coveredEntities = new Set(
    tests.flatMap(({ model_refs }) => model_refs.entities),
  );
  const coveredAssociations = new Set(
    tests.flatMap(({ model_refs }) => model_refs.associations),
  );
  if (
    expansionRefs.entities.some((id) => !coveredEntities.has(id)) ||
    expansionRefs.associations.some((id) => !coveredAssociations.has(id))
  ) {
    throw new Error(
      'Every confirmed model reference must be exercised by at least one test intent.',
    );
  }
  return tests;
}

function finalizeRuntimes(
  runtimes: ResolvedRuntime[],
  tests: TaskingTestItem[],
  inputs: TaskingTestInput[],
): FinalizedRuntime[] {
  const inputById = new Map(inputs.map((input) => [input.id, input]));
  return runtimes.map((runtime) => {
    const runtimeTests = tests.filter(
      ({ runtime_plan_id }) => runtime_plan_id === runtime.input.id,
    );
    const bindings = runtimeTests.map((test) => {
      const input = inputById.get(test.id);
      const step = runtime.definition.steps.find(
        ({ id }) => id === test.step_id,
      );
      if (!input || !step) {
        throw new Error(`${test.id} lost its process command binding.`);
      }
      const variables: Record<string, string> = {
        test_filter: required(input.testFilter, `${test.id}.testFilter`),
      };
      if (step.focused_command.allowed_variables.includes('project')) {
        if (!test.project_id) {
          throw new Error(`${test.id} lost its Nx project binding.`);
        }
        variables.project = test.project_id;
      }
      return {
        test_id: test.id,
        step_id: test.step_id,
        variables,
      };
    });
    const commandVariablesByTest = Object.fromEntries(
      bindings
        .map(({ test_id, variables }) => [test_id, variables] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const focusedCommands = materializeFocusedCommands(
      runtime.definition,
      bindings,
    );
    const testProjectIds = runtimeTests
      .flatMap(({ project_id }) => (project_id ? [project_id] : []))
      .sort();
    if (
      runtime.definition.quality_gates.some(({ scope }) => scope !== 'process')
    ) {
      if (!runtime.projectCatalog) {
        throw new TestProcessGapError(
          `${runtime.definition.id} has project-scoped gates without an Nx catalog.`,
        );
      }
      try {
        for (const gate of runtime.definition.quality_gates) {
          if (gate.scope === 'process') continue;
          const target = gate.required_target;
          if (!target) {
            throw new Error(
              `${runtime.definition.id} quality gate has no target.`,
            );
          }
          const projectIds =
            gate.scope === 'test_projects'
              ? [...new Set(testProjectIds)]
              : runtime.input.projectIds;
          for (const projectId of projectIds) {
            assertProjectHasTarget(
              nxProject(runtime.projectCatalog, projectId),
              target,
            );
          }
        }
      } catch (error) {
        throw new TestProcessGapError(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    const qualityGateCommands = materializeQualityGates(
      runtime.definition,
      runtime.input.projectIds,
      testProjectIds,
    );
    const selection: TestProcessSelection = {
      id: runtime.definition.id,
      path: runtime.path,
      runtime: runtime.input.runtime,
      functional_contexts: runtime.input.functionalContexts,
      technical_boundaries: runtime.input.technicalBoundaries,
      process_version: 3,
      definition_sha256: runtime.definitionSha256,
      selected_step_ids: runtime.selectedStepIds,
      project_ids: runtime.input.projectIds,
      ...(runtime.projectCatalog
        ? {
            project_catalog_sha256:
              runtime.projectCatalog.project_catalog_sha256,
          }
        : {}),
      command_variables_by_test: commandVariablesByTest,
      focused_commands: focusedCommands,
      quality_gate_commands: qualityGateCommands,
      materialized_sha256: materializedProcessSha256({
        processId: runtime.definition.id,
        definitionSha256: runtime.definitionSha256,
        projectIds: runtime.input.projectIds,
        projectCatalogSha256: runtime.projectCatalog?.project_catalog_sha256,
        commandVariablesByTest,
        focusedCommands,
        qualityGateCommands,
      }),
    };
    return { ...runtime, selection };
  });
}

function normalizeTasks(
  inputs: TaskingTaskInput[],
  tests: TaskingTestItem[],
  runtimes: FinalizedRuntime[],
): TaskingImplementationTask[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('Tasking requires implementation tasks.');
  }
  const ids = inputs.map(({ id }) => id);
  if (ids.some((id) => !TASK_ID.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error('Task ids must be unique TASK-xxx values.');
  }
  const testIds = new Set(tests.map(({ id }) => id));
  const tasks = inputs.map((input, index) => {
    const linkedTests = unique(input.testIds, `${input.id}.testIds`);
    if (!linkedTests.every((id) => testIds.has(id))) {
      throw new Error(`${input.id} references an unknown test.`);
    }
    const dependencies = unique(input.dependsOn, `${input.id}.dependsOn`, true);
    const priorIds = new Set(ids.slice(0, index));
    if (!dependencies.every((id) => priorIds.has(id))) {
      throw new Error(`${input.id} dependencies must reference earlier tasks.`);
    }
    const linked = tests.filter(({ id }) => linkedTests.includes(id));
    return {
      id: input.id,
      description: required(input.description, `${input.id}.description`),
      test_ids: linkedTests,
      depends_on: dependencies,
      model_refs: {
        entities: [
          ...new Set(linked.flatMap(({ model_refs }) => model_refs.entities)),
        ].sort(),
        associations: [
          ...new Set(
            linked.flatMap(({ model_refs }) => model_refs.associations),
          ),
        ].sort(),
      },
    } satisfies TaskingImplementationTask;
  });
  for (const testId of testIds) {
    const owners = tasks.filter(({ test_ids }) => test_ids.includes(testId));
    if (owners.length !== 1) {
      throw new Error(
        `${testId} must belong to exactly one ordered implementation task.`,
      );
    }
  }
  const stepOrder = new Map(
    runtimes.flatMap(({ selection }, processIndex) =>
      selection.selected_step_ids.map(
        (stepId, stepIndex) =>
          [
            `${selection.id}/${stepId}`,
            processIndex * 10_000 + stepIndex,
          ] as const,
      ),
    ),
  );
  const byTest = new Map(tests.map((test) => [test.id, test]));
  const orderedRanks = tasks.flatMap(({ test_ids }) =>
    test_ids.map((testId) => {
      const test = byTest.get(testId);
      const rank = test
        ? stepOrder.get(`${test.process_id}/${test.step_id}`)
        : undefined;
      if (rank === undefined) {
        throw new Error(`${testId} has no selected process-step order.`);
      }
      return rank;
    }),
  );
  if (
    orderedRanks.some(
      (rank, index) => index > 0 && rank < (orderedRanks[index - 1] ?? rank),
    )
  ) {
    throw new Error(
      'Ordered implementation tasks must preserve the selected test-process step order.',
    );
  }
  return tasks;
}

function renderTestList(
  state: WorkflowState,
  tests: TaskingTestItem[],
  runtimes: FinalizedRuntime[],
): string {
  const scenarios = state.confirmed_scenarios ?? [];
  const scenario = scenarios[0];
  if (!scenario) throw new Error('Tasking has no confirmed Scenario Set.');
  const render = (quadrant: 'Q1' | 'Q2') =>
    tests
      .filter((test) => test.quadrant === quadrant)
      .map((test) => {
        const runtime = runtimes.find(
          ({ input }) => input.id === test.runtime_plan_id,
        );
        const step = runtime?.definition.steps.find(
          ({ id }) => id === test.step_id,
        );
        const replaced =
          step?.replaced_boundaries
            .map(({ boundary, test_double }) => `${boundary}:${test_double}`)
            .join(', ') || 'none';
        return `- **${test.id}** · ${test.process_id}/${test.step_id} · ${test.intent}\n  - Nx project：${test.project_id ?? 'not applicable'}\n  - Scenarios：${test.scenario_ids.join(', ')}\n  - 业务数据：${test.business_data.join('；')}\n  - 模型实体：${test.model_refs.entities.join(', ') || 'none'}\n  - 模型关系：${test.model_refs.associations.join(', ') || 'none'}\n  - 场景结果：${test.scenario_outcome ?? '通过 Q2 追踪'}\n  - 真实边界：${step?.real_boundaries.join(', ') ?? 'unknown'}\n  - 替换边界：${replaced}${quadrant === 'Q2' ? `\n  - Q1 支撑：${test.supported_by.join(', ')}` : ''}`;
      })
      .join('\n');
  return `# Test List — ${scenario.story_id}

## Confirmed Scenario Set

${scenarios
  .map(
    (item) =>
      `### ${item.scenario_id} · ${item.title}\n\n- **Given**：${item.given.join('；')}\n- **When**：${item.when}\n- **Then**：${item.then.join('；')}\n- **Business data**：${item.business_data.join('；')}`,
  )
  .join('\n\n')}

## Q2 acceptance intent

${render('Q2')}

## Q1 support tests

${render('Q1')}

## Runtime and process trace

${runtimes.map(({ input, selection }) => `- ${input.id}：${input.runtime} · capabilities=${input.functionalContexts.join(',')} · boundaries=${input.technicalBoundaries.join(',')} · projects=${selection.project_ids.join(',') || 'none'} · process=${selection.id}`).join('\n')}
`;
}

function renderTaskList(tasks: TaskingImplementationTask[]): string {
  return `# Ordered Implementation Tasks

${tasks
  .map(
    (task) =>
      `## ${task.id}\n\n${task.description}\n\n- Tests: ${task.test_ids.join(', ')}\n- Model entities: ${task.model_refs.entities.join(', ') || 'none'}\n- Model associations: ${task.model_refs.associations.join(', ') || 'none'}\n- Depends on: ${task.depends_on.join(', ') || 'none'}\n`,
  )
  .join('\n')}`;
}

function writeArtifact(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function nextDraftId(cwd: string, state: WorkflowState): string {
  const drafts = findFiles(
    artifactPath(cwd, state, 'artifacts/04-planning/drafts'),
    (path) => path.endsWith('.json'),
  );
  return `DRAFT-${String(drafts.length + 1).padStart(3, '0')}`;
}

/** Build one reviewable test/task list and deterministic candidate plan. */
export function proposeTaskingDraft(
  cwd: string,
  input: TaskingDraftInput,
  now = new Date().toISOString(),
  loadProjectCatalog: ProjectCatalogLoader = readNxProjectCatalog,
): WorkflowState {
  const state = readState(cwd);
  assertTaskingState(state);
  const matched = resolveRuntimes(
    cwd,
    state,
    input.runtimes,
    now,
    loadProjectCatalog,
  );
  if (!Array.isArray(matched)) return matched;
  let tests: TaskingTestItem[];
  let resolved: FinalizedRuntime[];
  try {
    tests = normalizeTests(cwd, state, input.tests, matched);
    resolved = finalizeRuntimes(matched, tests, input.tests);
  } catch (error) {
    if (error instanceof TestProcessGapError) {
      return routeKnowledgeGap(cwd, state, 'process_gap', error.message, now);
    }
    throw error;
  }
  const tasks = normalizeTasks(input.tasks, tests, resolved);
  const scenarios = state.confirmed_scenarios ?? [];
  const scenario = scenarios[0];
  if (!scenario) throw new Error('Tasking has no confirmed Scenario Set.');
  const draftId = nextDraftId(cwd, state);
  const testList = renderTestList(state, tests, resolved);
  const taskList = renderTaskList(tasks);
  const testListPath = artifactRelativePath(
    state,
    'artifacts/04-planning/test-list.md',
  );
  const taskListPath = artifactRelativePath(
    state,
    'artifacts/04-planning/task-list.md',
  );
  const candidatePath = artifactRelativePath(
    state,
    'artifacts/04-planning/test-plan.candidate.json',
  );
  const candidateBase = {
    version: 2 as const,
    draft_id: draftId,
    story_id: scenario.story_id,
    scenario_ids: scenarios.map(({ scenario_id }) => scenario_id),
    tests,
    tasks,
    processes: resolved.map(({ selection }) => selection),
    test_list_path: testListPath,
    task_list_path: taskListPath,
    candidate_path: candidatePath,
    test_list_sha256: digest(testList),
    task_list_sha256: digest(taskList),
    proposed_at: now,
  };
  const candidate: TaskingCandidate = {
    ...candidateBase,
    candidate_sha256: digest(JSON.stringify(candidateBase)),
  };
  writeArtifact(join(cwd, testListPath), testList);
  writeArtifact(join(cwd, taskListPath), taskList);
  const candidateContent = `${JSON.stringify(candidate, null, 2)}\n`;
  writeArtifact(join(cwd, candidatePath), candidateContent);
  writeArtifact(
    artifactPath(cwd, state, `artifacts/04-planning/drafts/${draftId}.json`),
    candidateContent,
  );
  return writeState(cwd, {
    ...state,
    tasking_stage: 'desk_check',
    tasking_candidate: candidate,
    tasking_gap: undefined,
  });
}
