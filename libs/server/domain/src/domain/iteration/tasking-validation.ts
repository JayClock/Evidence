import { DomainError } from '../error';
import {
  TASKING_PROCESS_CATALOG,
  type TaskingProcessDefinition,
} from './tasking-catalog';
import type {
  DecideTaskingInput,
  DeskCheckAction,
  MaterializedTaskingCommand,
  MaterializedTaskingGate,
  ProposeTaskingInput,
  RecordNoModelImpactInput,
  TaskingProjectCatalogInput,
  TaskingRuntimeInput,
  TaskingTaskDescription,
  TaskingTestDescription,
} from './tasking';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const RUNTIME_ID = /^RUNTIME-\d{3,}$/;
const TEST_ID = /^TEST-\d{3,}$/;
const TASK_ID = /^TASK-\d{3,}$/;
const SAFE_TOKEN = /^[A-Za-z0-9_@./:-]+$/;
const PROJECT_ID = /^[A-Za-z0-9@][A-Za-z0-9@/_.-]{0,199}$/;
const RELATIVE_ROOT =
  /^(?!\/)(?![A-Za-z]:[\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[A-Za-z0-9@._/-]+$/;
const ACTIONS = new Set<DeskCheckAction>([
  'approve',
  'revise',
  'architecture_gap',
  'process_gap',
  'scenario_gap',
]);

export interface TaskingAuthorityScenario {
  id: string;
  title: string;
  given: string[];
  when: string;
  then: string[];
  businessData: string[];
}

export interface ValidatedTaskingRuntime {
  input: TaskingRuntimeInput;
  process: TaskingProcessDefinition;
  selectedStepIds: string[];
  focusedCommands: MaterializedTaskingCommand[];
  qualityGates: MaterializedTaskingGate[];
}

export interface ValidatedTaskingDraft {
  input: ProposeTaskingInput;
  projectCatalog: TaskingProjectCatalogInput;
  runtimes: ValidatedTaskingRuntime[];
  tests: TaskingTestDescription[];
  tasks: TaskingTaskDescription[];
}

export function normalizeRecordNoModelImpactInput(
  input: RecordNoModelImpactInput,
): RecordNoModelImpactInput {
  return {
    expectedIterationVersion: positiveInteger(
      input.expectedIterationVersion,
      'Iteration version',
    ),
    storyId: identifier(input.storyId, 'Story id'),
    storyRevisionId: identifier(input.storyRevisionId, 'Story Revision id'),
    storyRevisionSha256: sha256(
      input.storyRevisionSha256,
      'Story Revision SHA-256',
    ),
    reason: text(input.reason, 'No Model Impact reason', 2_000),
  };
}

export function normalizeProposeTaskingInput(
  raw: ProposeTaskingInput,
  scenarios: TaskingAuthorityScenario[],
): ValidatedTaskingDraft {
  if (scenarios.length === 0) {
    throw DomainError.conflict('Tasking requires confirmed Scenarios');
  }
  const projectCatalog = normalizeProjectCatalog(raw.projectCatalog);
  const projects = new Map(
    projectCatalog.projects.map((project) => [project.id, project]),
  );
  const runtimes = normalizeRuntimes(raw.runtimes, projects);
  const tests = normalizeTests(raw.tests, scenarios, runtimes, projects);
  const tasks = normalizeTasks(raw.tasks, tests, runtimes);
  const byTest = new Map(tests.map((test) => [test.id, test]));
  const input: ProposeTaskingInput = {
    expectedIterationVersion: positiveInteger(
      raw.expectedIterationVersion,
      'Iteration version',
    ),
    storyId: identifier(raw.storyId, 'Story id'),
    storyRevisionId: identifier(raw.storyRevisionId, 'Story Revision id'),
    noModelImpactDecisionId: identifier(
      raw.noModelImpactDecisionId,
      'No Model Impact Decision id',
    ),
    noModelImpactDecisionSha256: sha256(
      raw.noModelImpactDecisionSha256,
      'No Model Impact Decision SHA-256',
    ),
    projectCatalog,
    runtimes: runtimes.map(({ input }) => input),
    tests: tests.map((test) => ({
      id: test.id,
      quadrant: test.quadrant,
      intent: test.intent,
      runtimePlanId: test.runtimePlanId,
      stepId: test.stepId,
      ...(test.projectId ? { projectId: test.projectId } : {}),
      testFilter: test.testFilter,
      supportedBy: test.supportedBy,
      scenarioIds: test.scenarioIds,
      ...(test.scenarioOutcome
        ? { scenarioOutcome: test.scenarioOutcome }
        : {}),
      businessData: test.businessData,
      modelRefs: test.modelRefs,
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      description: task.description,
      testIds: task.testIds,
      dependsOn: task.dependsOn,
    })),
  };

  for (const runtime of runtimes) {
    runtime.focusedCommands = tests
      .filter((test) => test.runtimePlanId === runtime.input.id)
      .map((test) => {
        const step = runtime.process.steps.find(({ id }) => id === test.stepId);
        if (!step)
          throw DomainError.internal(`Tasking step ${test.stepId} disappeared`);
        return {
          testId: test.id,
          stepId: test.stepId,
          projectId: test.projectId,
          command: substitute(step.focusedCommandTemplate, {
            project: test.projectId ?? '',
            test_filter: test.testFilter,
          }),
        };
      });
    runtime.qualityGates = materializeGates(runtime, byTest, projects);
  }

  return { input, projectCatalog, runtimes, tests, tasks };
}

export function normalizeDecideTaskingInput(
  input: DecideTaskingInput,
): DecideTaskingInput {
  if (!ACTIONS.has(input.action)) {
    throw DomainError.validation(
      `unsupported Desk Check action: ${input.action}`,
    );
  }
  const reason = input.reason?.trim() || null;
  if (input.action !== 'approve' && !reason) {
    throw DomainError.validation(
      `Desk Check ${input.action} requires a reason`,
    );
  }
  return {
    expectedIterationVersion: positiveInteger(
      input.expectedIterationVersion,
      'Iteration version',
    ),
    candidateId: identifier(input.candidateId, 'Tasking Candidate id'),
    candidateSha256: sha256(input.candidateSha256, 'Tasking Candidate SHA-256'),
    action: input.action,
    reason,
  };
}

function normalizeProjectCatalog(
  input: TaskingProjectCatalogInput,
): TaskingProjectCatalogInput {
  if (!Array.isArray(input?.projects) || input.projects.length === 0) {
    throw DomainError.validation('Tasking requires an Nx project catalog');
  }
  const projects = input.projects.map((project, index) => {
    const id = pattern(project.id, PROJECT_ID, `Project ${index + 1} id`);
    const root = pattern(
      project.root,
      RELATIVE_ROOT,
      `Project ${id} relative root`,
    ).replace(/\\/g, '/');
    return {
      id,
      root,
      targets: unique(project.targets, `Project ${id} targets`).sort(),
    };
  });
  assertUnique(
    projects.map(({ id }) => id),
    'Nx project ids',
  );
  return {
    projects: projects.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function normalizeRuntimes(
  inputs: TaskingRuntimeInput[],
  projects: Map<string, TaskingProjectCatalogInput['projects'][number]>,
): ValidatedTaskingRuntime[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw DomainError.validation('Tasking requires at least one runtime plan');
  }
  assertUnique(
    inputs.map(({ id }) => id),
    'Runtime plan ids',
  );
  const resolved = inputs.map((raw) => {
    const input: TaskingRuntimeInput = {
      id: pattern(raw.id, RUNTIME_ID, 'Runtime plan id'),
      runtime:
        raw.runtime === 'typescript'
          ? raw.runtime
          : unsupportedRuntime(raw.runtime),
      functionalContexts: unique(
        raw.functionalContexts,
        `${raw.id} functional contexts`,
      ) as TaskingRuntimeInput['functionalContexts'],
      technicalBoundaries: unique(
        raw.technicalBoundaries,
        `${raw.id} technical boundaries`,
      ) as TaskingRuntimeInput['technicalBoundaries'],
      projectIds: unique(raw.projectIds, `${raw.id} project ids`).sort(),
    };
    for (const projectId of input.projectIds) {
      if (!projects.has(projectId)) {
        throw DomainError.validation(
          `${input.id} references unknown Nx project ${projectId}`,
        );
      }
    }
    const matches = TASKING_PROCESS_CATALOG.filter(
      (process) =>
        process.runtime === input.runtime &&
        input.functionalContexts.every((context) =>
          process.functionalContexts.includes(context),
        ) &&
        input.technicalBoundaries.every((boundary) =>
          process.technicalBoundaries.includes(boundary),
        ),
    );
    if (matches.length !== 1) {
      throw DomainError.validation(
        `${input.id} must match exactly one v3 test process; matched ${String(matches.length)}`,
      );
    }
    const process = matches[0];
    if (!process)
      throw DomainError.internal('Matched Tasking process disappeared');
    const selectedSteps = process.steps.filter((step) =>
      step.functionalContexts.some((context) =>
        input.functionalContexts.includes(context),
      ),
    );
    if (
      !selectedSteps.some(({ quadrant }) => quadrant === 'Q1') ||
      !selectedSteps.some(({ quadrant }) => quadrant === 'Q2')
    ) {
      throw DomainError.validation(`${input.id} process has no Q1/Q2 chain`);
    }
    return {
      input,
      process,
      selectedStepIds: selectedSteps.map(({ id }) => id),
      focusedCommands: [],
      qualityGates: [],
    };
  });
  assertUnique(
    resolved.map(({ process }) => process.id),
    'Selected process ids',
  );
  return resolved;
}

function normalizeTests(
  inputs: ProposeTaskingInput['tests'],
  scenarios: TaskingAuthorityScenario[],
  runtimes: ValidatedTaskingRuntime[],
  projects: Map<string, TaskingProjectCatalogInput['projects'][number]>,
): TaskingTestDescription[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw DomainError.validation('Tasking requires a test list');
  }
  assertUnique(
    inputs.map(({ id }) => id),
    'TEST ids',
  );
  const tests = inputs.map((raw) => {
    const id = pattern(raw.id, TEST_ID, 'TEST id');
    const runtime = runtimes.find(
      ({ input }) => input.id === raw.runtimePlanId,
    );
    if (!runtime)
      throw DomainError.validation(`${id} references unknown runtime plan`);
    const step = runtime.process.steps.find(
      ({ id: stepId }) => stepId === raw.stepId,
    );
    if (!step || step.quadrant !== raw.quadrant) {
      throw DomainError.validation(`${id} references an invalid process step`);
    }
    const projectId = raw.projectId?.trim() || null;
    if (step.requiresProject !== Boolean(projectId)) {
      throw DomainError.validation(
        `${id} project ownership does not match ${step.id}`,
      );
    }
    if (projectId) {
      const project = projects.get(projectId);
      if (!project || !runtime.input.projectIds.includes(projectId)) {
        throw DomainError.validation(
          `${id} references an unplanned Nx project`,
        );
      }
      if (!project.targets.includes('test')) {
        throw DomainError.validation(
          `${projectId} does not expose a test target`,
        );
      }
      if (!step.nearestTestRoots.some((root) => ownsRoot(root, project.root))) {
        throw DomainError.validation(
          `${projectId} does not own ${step.id} tests`,
        );
      }
    }
    const scenarioIds = unique(raw.scenarioIds, `${id} Scenario refs`);
    const selectedScenarios = scenarioIds.map((scenarioId) => {
      const scenario = scenarios.find(({ id }) => id === scenarioId);
      if (!scenario)
        throw DomainError.validation(
          `${id} references unknown Scenario ${scenarioId}`,
        );
      return scenario;
    });
    const businessData = unique(raw.businessData, `${id} business data`);
    const allowedData = new Set(
      selectedScenarios.flatMap(({ businessData }) => businessData),
    );
    if (!businessData.every((datum) => allowedData.has(datum))) {
      throw DomainError.validation(`${id} contains data outside its Scenarios`);
    }
    if (
      raw.modelRefs.entities.length > 0 ||
      raw.modelRefs.associations.length > 0
    ) {
      throw DomainError.validation(
        `${id} modelRefs must be empty after no-model-impact`,
      );
    }
    const scenarioOutcome = raw.scenarioOutcome?.trim() || null;
    if (
      raw.quadrant === 'Q2' &&
      (selectedScenarios.length !== 1 ||
        !scenarioOutcome ||
        !selectedScenarios[0]?.then.includes(scenarioOutcome))
    ) {
      throw DomainError.validation(
        `${id} Q2 must trace one exact Scenario Then`,
      );
    }
    return {
      id,
      quadrant: raw.quadrant,
      intent: text(raw.intent, `${id} intent`, 2_000),
      runtimePlanId: runtime.input.id,
      processId: runtime.process.id,
      stepId: step.id,
      projectId,
      testFilter: pattern(raw.testFilter, SAFE_TOKEN, `${id} test filter`),
      supportedBy: unique(raw.supportedBy, `${id} Q1 support`, true),
      scenarioIds,
      scenarioOutcome,
      businessData,
      modelRefs: { entities: [], associations: [] },
    } satisfies TaskingTestDescription;
  });
  const q1Ids = new Set(
    tests.filter(({ quadrant }) => quadrant === 'Q1').map(({ id }) => id),
  );
  if (q1Ids.size === 0 || !tests.some(({ quadrant }) => quadrant === 'Q2')) {
    throw DomainError.validation(
      'Tasking requires Q1 support and Q2 acceptance tests',
    );
  }
  for (const test of tests) {
    if (test.quadrant === 'Q1' && test.supportedBy.length > 0) {
      throw DomainError.validation(`${test.id} Q1 cannot declare supportedBy`);
    }
    if (
      test.quadrant === 'Q2' &&
      (test.supportedBy.length === 0 ||
        !test.supportedBy.every((id) => q1Ids.has(id)))
    ) {
      throw DomainError.validation(`${test.id} Q2 requires valid Q1 support`);
    }
  }
  const supported = new Set(tests.flatMap((test) => test.supportedBy));
  if ([...q1Ids].some((id) => !supported.has(id))) {
    throw DomainError.validation(
      'Every Q1 TEST must support at least one Q2 TEST',
    );
  }
  for (const scenario of scenarios) {
    for (const outcome of scenario.then) {
      if (
        !tests.some(
          (test) =>
            test.quadrant === 'Q2' &&
            test.scenarioIds.includes(scenario.id) &&
            test.scenarioOutcome === outcome,
        )
      ) {
        throw DomainError.validation(
          `${scenario.id} outcome has no Q2 TEST: ${outcome}`,
        );
      }
    }
  }
  for (const runtime of runtimes) {
    for (const stepId of runtime.selectedStepIds) {
      if (
        !tests.some(
          (test) =>
            test.runtimePlanId === runtime.input.id && test.stepId === stepId,
        )
      ) {
        throw DomainError.validation(
          `${runtime.process.id}/${stepId} has no TEST`,
        );
      }
    }
  }
  return tests;
}

function normalizeTasks(
  inputs: ProposeTaskingInput['tasks'],
  tests: TaskingTestDescription[],
  runtimes: ValidatedTaskingRuntime[],
): TaskingTaskDescription[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw DomainError.validation('Tasking requires implementation TASKs');
  }
  assertUnique(
    inputs.map(({ id }) => id),
    'TASK ids',
  );
  const allTestIds = new Set(tests.map(({ id }) => id));
  const tasks = inputs.map((raw, index) => {
    const id = pattern(raw.id, TASK_ID, 'TASK id');
    const testIds = unique(raw.testIds, `${id} TEST refs`);
    if (!testIds.every((testId) => allTestIds.has(testId))) {
      throw DomainError.validation(`${id} references unknown TEST`);
    }
    const dependsOn = unique(raw.dependsOn, `${id} dependencies`, true);
    const prior = new Set(
      inputs.slice(0, index).map(({ id: priorId }) => priorId),
    );
    if (!dependsOn.every((dependency) => prior.has(dependency))) {
      throw DomainError.validation(
        `${id} dependencies must reference earlier TASKs`,
      );
    }
    return {
      id,
      description: text(raw.description, `${id} description`, 2_000),
      testIds,
      dependsOn,
      modelRefs: { entities: [], associations: [] },
    } satisfies TaskingTaskDescription;
  });
  for (const testId of allTestIds) {
    if (tasks.filter(({ testIds }) => testIds.includes(testId)).length !== 1) {
      throw DomainError.validation(`${testId} must belong to exactly one TASK`);
    }
  }
  const stepOrder = new Map(
    runtimes.flatMap((runtime, processIndex) =>
      runtime.selectedStepIds.map(
        (stepId, stepIndex) =>
          [
            `${runtime.process.id}/${stepId}`,
            processIndex * 100 + stepIndex,
          ] as const,
      ),
    ),
  );
  const testById = new Map(tests.map((test) => [test.id, test]));
  const ranks = tasks.flatMap(({ testIds }) =>
    testIds.map((testId) => {
      const test = testById.get(testId);
      const rank = test
        ? stepOrder.get(`${test.processId}/${test.stepId}`)
        : undefined;
      if (rank === undefined)
        throw DomainError.internal(`${testId} lost process order`);
      return rank;
    }),
  );
  if (
    ranks.some((rank, index) => index > 0 && rank < (ranks[index - 1] ?? rank))
  ) {
    throw DomainError.validation('TASK order must preserve process-step order');
  }
  return tasks;
}

function materializeGates(
  runtime: ValidatedTaskingRuntime,
  tests: Map<string, TaskingTestDescription>,
  projects: Map<string, TaskingProjectCatalogInput['projects'][number]>,
): MaterializedTaskingGate[] {
  const testProjects = [
    ...new Set(
      runtime.focusedCommands.flatMap(({ testId }) => {
        const projectId = tests.get(testId)?.projectId;
        return projectId ? [projectId] : [];
      }),
    ),
  ].sort();
  const gates: MaterializedTaskingGate[] = [];
  for (const gate of runtime.process.qualityGates) {
    if (gate.scope === 'process') {
      gates.push({
        projectId: null,
        target: null,
        command: gate.commandTemplate,
      });
      continue;
    }
    const projectIds =
      gate.scope === 'test_projects' ? testProjects : runtime.input.projectIds;
    for (const projectId of projectIds) {
      const project = projects.get(projectId);
      if (
        !project ||
        !gate.requiredTarget ||
        !project.targets.includes(gate.requiredTarget)
      ) {
        throw DomainError.validation(
          `${projectId} does not expose required ${gate.requiredTarget ?? 'unknown'} target`,
        );
      }
      gates.push({
        projectId,
        target: gate.requiredTarget,
        command: substitute(gate.commandTemplate, { project: projectId }),
      });
    }
  }
  return [
    ...new Map(gates.map((gate) => [JSON.stringify(gate), gate])).values(),
  ];
}

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (!value || !SAFE_TOKEN.test(value)) {
      throw DomainError.validation(`Tasking command variable ${key} is unsafe`);
    }
    return value;
  });
}

function ownsRoot(stepRoot: string, projectRoot: string): boolean {
  return (
    projectRoot === stepRoot ||
    projectRoot.startsWith(`${stepRoot}/`) ||
    stepRoot.startsWith(`${projectRoot}/`)
  );
}

function unique(values: string[], label: string, allowEmpty = false): string[] {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw DomainError.validation(
      `${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`,
    );
  }
  const normalized = values.map((value) => text(value, label, 2_000));
  assertUnique(normalized, label);
  return normalized;
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw DomainError.validation(`${label} must be unique`);
  }
}

function text(value: string, label: string, maximum: number): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maximum) {
    throw DomainError.validation(`${label} is invalid`);
  }
  return normalized;
}

function pattern(value: string, expression: RegExp, label: string): string {
  const normalized = text(value, label, 500);
  if (!expression.test(normalized))
    throw DomainError.validation(`${label} is invalid`);
  return normalized;
}

function identifier(value: string, label: string): string {
  return pattern(value, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/, label);
}

function sha256(value: string, label: string): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256.test(normalized))
    throw DomainError.validation(`${label} is invalid`);
  return normalized;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw DomainError.validation(`${label} must be a positive integer`);
  }
  return value;
}

function unsupportedRuntime(value: never): never {
  throw DomainError.validation(`unsupported Tasking runtime: ${String(value)}`);
}
