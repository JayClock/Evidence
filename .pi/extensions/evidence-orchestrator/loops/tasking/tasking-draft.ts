import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findFiles } from '../../evidence/artifact-index';
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
  materializedProcessSha256,
  testProcessDefinitionSha256,
  type TestProcessDefinition,
} from '../../capabilities/test-process/catalog';

export interface TaskingRuntimeInput {
  id: string;
  runtime: TestProcessRuntime;
  functionalContexts: string[];
  technicalBoundaries: string[];
  testFilter: string;
}

export interface TaskingTestInput {
  id: string;
  quadrant: 'Q1' | 'Q2';
  intent: string;
  runtimePlanId: string;
  stepId: string;
  supportedBy: string[];
  scenarioOutcome?: string;
  businessData: string[];
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
  input: TaskingRuntimeInput;
  definition: TestProcessDefinition;
  selection: TestProcessSelection;
}

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
  if (
    state.workflow_version !== 5 ||
    state.loop !== 'tasking' ||
    !state.confirmed_scenario ||
    state.modeling_stage !== 'challenged' ||
    state.model_challenges?.at(-1)?.outcome !== 'pass'
  ) {
    throw new Error(
      'Tasking requires one confirmed, model-challenged v5 Scenario.',
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
          ? `No v2 test process uniquely covers ${input.runtime}/${functionalContexts.join(',')} at ${technicalBoundaries.join(',')}.`
          : `Multiple v2 test processes cover ${input.runtime}/${functionalContexts.join(',')} at ${technicalBoundaries.join(',')}: ${candidates.map(({ definition }) => definition.id).join(', ')}.`;
      return routeKnowledgeGap(cwd, state, 'process_gap', reason, now);
    }
    const candidate = candidates[0];
    if (!candidate)
      throw new Error(`Matched process disappeared for ${input.id}.`);
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
    const selectedStepIds = selectedSteps.map(({ id }) => id);
    const commandVariables = {
      test_filter: required(input.testFilter, `${input.id}.testFilter`),
    };
    const focusedCommands = materializeFocusedCommands(
      candidate.definition,
      commandVariables,
    ).filter(({ step_id }) => selectedStepIds.includes(step_id));
    const definitionPath = join(cwd, candidate.path);
    const definitionSha256 = testProcessDefinitionSha256(definitionPath);
    resolved.push({
      input: {
        ...input,
        functionalContexts,
        technicalBoundaries,
        testFilter: commandVariables.test_filter,
      },
      definition: candidate.definition,
      selection: {
        id: candidate.definition.id,
        path: candidate.path,
        runtime: input.runtime,
        functional_contexts: functionalContexts,
        technical_boundaries: technicalBoundaries,
        process_version: 2,
        definition_sha256: definitionSha256,
        selected_step_ids: selectedStepIds,
        command_variables: commandVariables,
        focused_commands: focusedCommands,
        materialized_sha256: materializedProcessSha256(
          candidate.definition.id,
          definitionSha256,
          commandVariables,
          focusedCommands,
        ),
      },
    });
  }
  const processIds = resolved.map(({ selection }) => selection.id);
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

function normalizeTests(
  state: WorkflowState,
  inputs: TaskingTestInput[],
  runtimes: ResolvedRuntime[],
): TaskingTestItem[] {
  const scenario = state.confirmed_scenario;
  if (!scenario) throw new Error('Tasking has no confirmed Scenario.');
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
    const businessData = unique(input.businessData, `${input.id}.businessData`);
    if (
      !businessData.every((datum) => scenario.business_data.includes(datum))
    ) {
      throw new Error(
        `${input.id} contains data outside the confirmed Scenario.`,
      );
    }
    const outcome = input.scenarioOutcome?.trim();
    if (outcome && !scenario.then.includes(outcome)) {
      throw new Error(
        `${input.id} contains an outcome outside the confirmed Scenario.`,
      );
    }
    if (input.quadrant === 'Q2' && !outcome) {
      throw new Error(
        `${input.id} Q2 requires one exact confirmed Scenario outcome.`,
      );
    }
    return {
      id: input.id,
      quadrant: input.quadrant,
      intent: required(input.intent, `${input.id}.intent`),
      runtime_plan_id: input.runtimePlanId,
      process_id: runtime.selection.id,
      step_id: input.stepId,
      supported_by: unique(input.supportedBy, `${input.id}.supportedBy`, true),
      ...(outcome ? { scenario_outcome: outcome } : {}),
      business_data: businessData,
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
  for (const runtime of runtimes) {
    for (const step of runtime.definition.steps) {
      const applicable = step.functional_contexts.some((context) =>
        runtime.input.functionalContexts.includes(context),
      );
      if (
        applicable &&
        !tests.some(
          ({ process_id, step_id }) =>
            process_id === runtime.selection.id && step_id === step.id,
        )
      ) {
        throw new Error(
          `Selected process step ${runtime.selection.id}/${step.id} has no test-list item.`,
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
  return tests;
}

function normalizeTasks(
  inputs: TaskingTaskInput[],
  tests: TaskingTestItem[],
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
    return {
      id: input.id,
      description: required(input.description, `${input.id}.description`),
      test_ids: linkedTests,
      depends_on: dependencies,
    } satisfies TaskingImplementationTask;
  });
  for (const testId of testIds) {
    if (!tasks.some(({ test_ids }) => test_ids.includes(testId))) {
      throw new Error(`${testId} has no implementation task.`);
    }
  }
  return tasks;
}

function renderTestList(
  state: WorkflowState,
  tests: TaskingTestItem[],
  runtimes: ResolvedRuntime[],
): string {
  const scenario = state.confirmed_scenario;
  if (!scenario) throw new Error('Tasking has no confirmed Scenario.');
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
        return `- **${test.id}** · ${test.process_id}/${test.step_id} · ${test.intent}\n  - 业务数据：${test.business_data.join('；')}\n  - 场景结果：${test.scenario_outcome ?? '通过 Q2 追踪'}\n  - 真实边界：${step?.real_boundaries.join(', ') ?? 'unknown'}\n  - 替换边界：${replaced}${quadrant === 'Q2' ? `\n  - Q1 支撑：${test.supported_by.join(', ')}` : ''}`;
      })
      .join('\n');
  return `# Test List — ${scenario.story_id} / ${scenario.scenario_id}

## Confirmed Scenario

- **Given**：${scenario.given.join('；')}
- **When**：${scenario.when}
- **Then**：${scenario.then.join('；')}
- **Business data**：${scenario.business_data.join('；')}

## Q2 acceptance intent

${render('Q2')}

## Q1 support tests

${render('Q1')}

## Runtime and process trace

${runtimes.map(({ input, selection }) => `- ${input.id}：${input.runtime} · capabilities=${input.functionalContexts.join(',')} · boundaries=${input.technicalBoundaries.join(',')} · process=${selection.id}`).join('\n')}
`;
}

function renderTaskList(tasks: TaskingImplementationTask[]): string {
  return `# Ordered Implementation Tasks

${tasks
  .map(
    (task) =>
      `## ${task.id}\n\n${task.description}\n\n- Tests: ${task.test_ids.join(', ')}\n- Depends on: ${task.depends_on.join(', ') || 'none'}\n`,
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
): WorkflowState {
  const state = readState(cwd);
  assertTaskingState(state);
  const resolved = resolveRuntimes(cwd, state, input.runtimes, now);
  if (!Array.isArray(resolved)) return resolved;
  const tests = normalizeTests(state, input.tests, resolved);
  const tasks = normalizeTasks(input.tasks, tests);
  const scenario = state.confirmed_scenario;
  if (!scenario) throw new Error('Tasking has no confirmed Scenario.');
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
    version: 1 as const,
    draft_id: draftId,
    story_id: scenario.story_id,
    scenario_id: scenario.scenario_id,
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
