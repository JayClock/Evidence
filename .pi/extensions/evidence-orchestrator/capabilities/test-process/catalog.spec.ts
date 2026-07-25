import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  matchingTestProcesses,
  materializeFocusedCommands,
  materializeQualityGates,
  materializedProcessSha256,
  readTestProcess,
  validateTestProcessDirectory,
} from './catalog';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';

afterEach(cleanupWorkspaces);

const validProcessV3 = {
  version: 3,
  id: 'rust-workspace-v3',
  owner: 'server-platform',
  runtime: 'rust',
  applies_to: {
    capabilities: ['workspace'],
    technical_boundaries: ['rust-domain', 'database-store', 'axum-api'],
    when: 'A workspace Scenario belongs to the Rust route.',
  },
  steps: [
    {
      id: 'domain-q1',
      purpose: 'Drive the workspace rule.',
      quadrant: 'Q1',
      functional_contexts: ['workspace'],
      real_boundaries: ['rust-domain'],
      replaced_boundaries: [],
      nearest_test: {
        rule: 'Use the owning domain test.',
        roots: ['libs/server/domain/src'],
      },
      focused_command: {
        template: 'cargo test -p evidence-server {{test_filter}}',
        allowed_variables: ['test_filter'],
      },
      red: {
        expected_failure_kind: 'behavior',
        expected_failure: 'The business assertion fails.',
      },
      green: { done_when: 'The focused assertion passes.' },
      refactor: { done_when: 'The focused assertion stays green.' },
    },
    {
      id: 'api-q2',
      purpose: 'Confirm the workspace Scenario through Axum.',
      quadrant: 'Q2',
      functional_contexts: ['workspace'],
      real_boundaries: ['axum-api', 'rust-domain'],
      replaced_boundaries: [
        { boundary: 'database-store', test_double: 'fake' },
      ],
      nearest_test: {
        rule: 'Use the owning API test.',
        roots: ['libs/server/api/src'],
      },
      focused_command: {
        template: 'cargo test -p evidence-server {{test_filter}}',
        allowed_variables: ['test_filter'],
      },
      red: {
        expected_failure_kind: 'behavior',
        expected_failure: 'The HTTP assertion fails.',
      },
      green: { done_when: 'The focused HTTP assertion passes.' },
      refactor: { done_when: 'The focused HTTP assertion stays green.' },
    },
  ],
  quality_gates: [
    {
      scope: 'process',
      template: 'cargo test -p evidence-server',
      allowed_variables: [],
    },
    {
      scope: 'process',
      template: 'cargo clippy -p evidence-server --all-targets -- -D warnings',
      allowed_variables: [],
    },
  ],
};

function webProcessV3() {
  const source = structuredClone(validProcessV3);
  return {
    ...source,
    id: 'typescript-web-v3',
    runtime: 'typescript',
    applies_to: {
      capabilities: ['workspace'],
      technical_boundaries: ['react-feature'],
      when: 'A workspace Scenario belongs to Web.',
    },
    steps: source.steps.map((step) => ({
      ...step,
      real_boundaries: ['react-feature'],
      replaced_boundaries: [],
      nearest_test: {
        rule: 'Use the owning Web test.',
        roots: ['apps/web/src', 'libs/web'],
      },
      focused_command: {
        template:
          'pnpm nx test {{project}} --run --testNamePattern={{test_filter}}',
        allowed_variables: ['project', 'test_filter'],
      },
    })),
    quality_gates: [
      {
        scope: 'test_projects',
        required_target: 'test',
        template: 'pnpm nx test {{project}} --run',
        allowed_variables: ['project'],
      },
      {
        scope: 'planned_projects',
        required_target: 'typecheck',
        template: 'pnpm nx typecheck {{project}}',
        allowed_variables: ['project'],
      },
      {
        scope: 'planned_projects',
        required_target: 'lint',
        template: 'pnpm nx lint {{project}}',
        allowed_variables: ['project'],
      },
    ],
  };
}

describe('test-processes', () => {
  it('accepts only current v3 process definitions', () => {
    const cwd = workspace();
    write(
      cwd,
      'process.json',
      JSON.stringify({ version: 2, id: 'old-process' }),
    );

    expect(() => readTestProcess(`${cwd}/process.json`)).toThrow(
      'version must be 3',
    );
  });

  it('rejects retired step metadata instead of silently accepting it', () => {
    const cwd = workspace();
    const process = structuredClone(validProcessV3);
    Object.assign(process.steps[0], {
      test_list_template: 'evidence-test-list-v1',
    });
    write(cwd, 'process.json', JSON.stringify(process));

    expect(() => readTestProcess(`${cwd}/process.json`)).toThrow(
      'contains unsupported fields: test_list_template',
    );
  });

  it('requires the typed behavior Red contract on every active step', () => {
    const cwd = workspace();
    const missing = structuredClone(validProcessV3);
    const first = missing.steps[0];
    if (!first) throw new Error('Missing process fixture step.');
    first.red = {
      expected_failure: 'Compilation fails.',
    } as typeof first.red;
    write(cwd, 'missing.json', JSON.stringify(missing));
    expect(() => readTestProcess(`${cwd}/missing.json`)).toThrow(
      'expected_failure_kind must be behavior',
    );

    const compile = structuredClone(validProcessV3);
    const compileStep = compile.steps[0];
    if (!compileStep) throw new Error('Missing process fixture step.');
    compileStep.red.expected_failure_kind = 'compile' as 'behavior';
    write(cwd, 'compile.json', JSON.stringify(compile));
    expect(() => readTestProcess(`${cwd}/compile.json`)).toThrow(
      'expected_failure_kind must be behavior',
    );
  });

  it('parses v3 boundaries and materializes one command per TEST', () => {
    const cwd = workspace();
    const path = `${cwd}/process.json`;
    write(cwd, 'process.json', JSON.stringify(validProcessV3));

    const process = readTestProcess(path);
    const commands = materializeFocusedCommands(process, [
      {
        test_id: 'TEST-001',
        step_id: 'domain-q1',
        variables: { test_filter: 'workspace_domain' },
      },
      {
        test_id: 'TEST-002',
        step_id: 'api-q2',
        variables: { test_filter: 'workspace_api' },
      },
    ]);

    expect(process).toMatchObject({
      version: 3,
      runtime: 'rust',
      steps: [
        {
          id: 'domain-q1',
          red: { expected_failure_kind: 'behavior' },
        },
        { id: 'api-q2' },
      ],
    });
    expect(commands).toEqual([
      {
        test_id: 'TEST-001',
        step_id: 'domain-q1',
        command: 'cargo test -p evidence-server workspace_domain',
      },
      {
        test_id: 'TEST-002',
        step_id: 'api-q2',
        command: 'cargo test -p evidence-server workspace_api',
      },
    ]);
    expect(materializeQualityGates(process, [], [])).toEqual([
      { command: 'cargo test -p evidence-server' },
      {
        command: 'cargo clippy -p evidence-server --all-targets -- -D warnings',
      },
    ]);
  });

  it('materializes project-scoped commands and complete planned gates', () => {
    const cwd = workspace();
    write(cwd, 'web.json', JSON.stringify(webProcessV3()));
    const process = readTestProcess(`${cwd}/web.json`);
    const commandVariablesByTest = {
      'TEST-001': {
        project: '@evidence/web-feature-diagrams',
        test_filter: 'diagram_rule',
      },
      'TEST-002': {
        project: '@evidence/web',
        test_filter: 'diagram_route',
      },
    };
    const commands = materializeFocusedCommands(process, [
      {
        test_id: 'TEST-001',
        step_id: 'domain-q1',
        variables: commandVariablesByTest['TEST-001'],
      },
      {
        test_id: 'TEST-002',
        step_id: 'api-q2',
        variables: commandVariablesByTest['TEST-002'],
      },
    ]);
    const gates = materializeQualityGates(
      process,
      ['@evidence/web-feature-diagrams', '@evidence/web'],
      ['@evidence/web-feature-diagrams', '@evidence/web'],
    );

    expect(commands).toEqual([
      {
        test_id: 'TEST-001',
        step_id: 'domain-q1',
        project_id: '@evidence/web-feature-diagrams',
        command:
          'pnpm nx test @evidence/web-feature-diagrams --run --testNamePattern=diagram_rule',
      },
      {
        test_id: 'TEST-002',
        step_id: 'api-q2',
        project_id: '@evidence/web',
        command:
          'pnpm nx test @evidence/web --run --testNamePattern=diagram_route',
      },
    ]);
    expect(gates).toEqual([
      {
        project_id: '@evidence/web',
        target: 'test',
        command: 'pnpm nx test @evidence/web --run',
      },
      {
        project_id: '@evidence/web-feature-diagrams',
        target: 'test',
        command: 'pnpm nx test @evidence/web-feature-diagrams --run',
      },
      {
        project_id: '@evidence/web',
        target: 'typecheck',
        command: 'pnpm nx typecheck @evidence/web',
      },
      {
        project_id: '@evidence/web-feature-diagrams',
        target: 'typecheck',
        command: 'pnpm nx typecheck @evidence/web-feature-diagrams',
      },
      {
        project_id: '@evidence/web',
        target: 'lint',
        command: 'pnpm nx lint @evidence/web',
      },
      {
        project_id: '@evidence/web-feature-diagrams',
        target: 'lint',
        command: 'pnpm nx lint @evidence/web-feature-diagrams',
      },
    ]);
    expect(
      materializedProcessSha256({
        processId: process.id,
        definitionSha256: 'a'.repeat(64),
        projectIds: ['@evidence/web-feature-diagrams', '@evidence/web'],
        projectCatalogSha256: 'b'.repeat(64),
        commandVariablesByTest,
        focusedCommands: commands,
        qualityGateCommands: gates,
      }),
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects invalid gate schemas and unsafe TEST variables', () => {
    const cwd = workspace();
    const invalid = webProcessV3();
    invalid.quality_gates[0] = {
      scope: 'test_projects',
      required_target: 'test',
      template: 'pnpm nx test @evidence/web',
      allowed_variables: [],
    };
    write(cwd, 'invalid.json', JSON.stringify(invalid));
    expect(() => readTestProcess(`${cwd}/invalid.json`)).toThrow(
      'project scope must declare only the project variable',
    );

    write(cwd, 'valid.json', JSON.stringify(validProcessV3));
    const process = readTestProcess(`${cwd}/valid.json`);
    expect(() =>
      materializeFocusedCommands(process, [
        {
          test_id: 'TEST-001',
          step_id: 'domain-q1',
          variables: { test_filter: 'SC-008;rm' },
        },
      ]),
    ).toThrow('unsafe value');
    expect(() =>
      materializeFocusedCommands(process, [
        {
          test_id: 'TEST-001',
          step_id: 'domain-q1',
          variables: {},
        },
      ]),
    ).toThrow('must exactly match');
  });

  it('rejects a process that does not provide both support quadrants', () => {
    const cwd = workspace();
    write(
      cwd,
      'process.json',
      JSON.stringify({
        ...validProcessV3,
        steps: [validProcessV3.steps[0]],
      }),
    );

    expect(() => readTestProcess(`${cwd}/process.json`)).toThrow(
      'at least one Q2',
    );
  });

  it('reports zero and multiple matches without guessing', () => {
    const cwd = workspace();
    write(cwd, 'processes/one.json', JSON.stringify(validProcessV3));

    expect(
      matchingTestProcesses(
        cwd,
        `${cwd}/processes`,
        'rust',
        ['logical-model'],
        ['rust-domain'],
      ),
    ).toHaveLength(0);

    write(
      cwd,
      'processes/two.json',
      JSON.stringify({ ...validProcessV3, id: 'rust-workspace-v3-copy' }),
    );
    expect(
      matchingTestProcesses(
        cwd,
        `${cwd}/processes`,
        'rust',
        ['workspace'],
        ['axum-api'],
      ),
    ).toHaveLength(2);
  });

  it('rejects retired runtime aliases in the active vocabulary', () => {
    const cwd = workspace();
    write(
      cwd,
      'engineering/evidence-orchestrator/runtime-contexts.json',
      JSON.stringify({
        version: 2,
        functional_contexts: [{ id: 'workspace' }],
        technical_boundaries: {
          rust: ['rust-domain', 'database-store', 'axum-api'],
        },
        legacy_v1_runtime_contexts: { rust: ['rust-api'] },
      }),
    );
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/process.json',
      JSON.stringify(validProcessV3),
    );

    expect(() =>
      validateTestProcessDirectory(
        `${cwd}/engineering/evidence-orchestrator/test-processes`,
      ),
    ).toThrow('contains unsupported fields: legacy_v1_runtime_contexts');
  });

  it('ships one valid v3 process for every supported runtime route', () => {
    const definitions = validateTestProcessDirectory(
      join(process.cwd(), 'engineering/evidence-orchestrator/test-processes'),
    );

    expect(definitions).toHaveLength(3);
    expect(definitions.every(({ version }) => version === 3)).toBe(true);
    expect(new Set(definitions.map(({ runtime }) => runtime))).toEqual(
      new Set(['typescript']),
    );
    const electronShell = definitions
      .find(({ id }) => id === 'typescript-electron-shell')
      ?.steps.find(({ id }) => id === 'electron-shell-q1');
    expect(electronShell?.red.expected_failure_kind).toBe('behavior');
    expect(electronShell?.red.expected_failure).toContain(
      'lifecycle or security behavior is absent',
    );
    expect(
      matchingTestProcesses(
        process.cwd(),
        join(process.cwd(), 'engineering/evidence-orchestrator/test-processes'),
        'typescript',
        ['workspace'],
      ),
    ).toHaveLength(3);
    expect(
      matchingTestProcesses(
        process.cwd(),
        join(process.cwd(), 'engineering/evidence-orchestrator/test-processes'),
        'typescript',
        ['workspace'],
        ['react-feature'],
      ),
    ).toHaveLength(1);
  });
});
