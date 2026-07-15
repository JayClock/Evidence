import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  matchingTestProcesses,
  materializeFocusedCommands,
  readTestProcess,
  validateTestProcessDirectory,
} from './process-catalog';
import { cleanupWorkspaces, workspace, write } from '../tests/support';

afterEach(cleanupWorkspaces);

const validProcessV2 = {
  version: 2,
  id: 'rust-workspace-v2',
  owner: 'server-platform',
  runtime: 'rust',
  applies_to: {
    capabilities: ['workspace'],
    technical_boundaries: ['rust-domain', 'seaorm-store', 'axum-api'],
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
      test_list_template: 'evidence-test-list-v1',
      nearest_test: {
        rule: 'Use the owning domain test.',
        roots: ['libs/server/domain/src'],
      },
      focused_command: {
        template: 'cargo test -p evidence-server {{test_filter}}',
        allowed_variables: ['test_filter'],
      },
      red: { expected_failure: 'The business assertion fails.' },
      green: { done_when: 'The focused assertion passes.' },
      refactor: { done_when: 'The focused assertion stays green.' },
    },
    {
      id: 'api-q2',
      purpose: 'Confirm the workspace Scenario through Axum.',
      quadrant: 'Q2',
      functional_contexts: ['workspace'],
      real_boundaries: ['axum-api', 'rust-domain'],
      replaced_boundaries: [{ boundary: 'seaorm-store', test_double: 'fake' }],
      test_list_template: 'evidence-test-list-v1',
      nearest_test: {
        rule: 'Use the owning API test.',
        roots: ['libs/server/api/src'],
      },
      focused_command: {
        template: 'cargo test -p evidence-server {{test_filter}}',
        allowed_variables: ['test_filter'],
      },
      red: { expected_failure: 'The HTTP assertion fails.' },
      green: { done_when: 'The focused HTTP assertion passes.' },
      refactor: { done_when: 'The focused HTTP assertion stays green.' },
    },
  ],
  quality_gates: [
    'cargo test -p evidence-server',
    'cargo clippy -p evidence-server --all-targets -- -D warnings',
  ],
};

describe('test-processes', () => {
  it('rejects a pre-v2 process from the active catalog', () => {
    const cwd = workspace();
    write(
      cwd,
      'process.json',
      JSON.stringify({ version: 1, id: 'old-process' }),
    );

    expect(() => readTestProcess(`${cwd}/process.json`)).toThrow(
      'version must be 2',
    );
  });

  it('parses v2 ordered boundaries, doubles, focused feedback, and completion rules', () => {
    const cwd = workspace();
    const path = `${cwd}/process.json`;
    write(cwd, 'process.json', JSON.stringify(validProcessV2));

    const process = readTestProcess(path);

    expect(process).toMatchObject({
      version: 2,
      runtime: 'rust',
      functional_contexts: ['workspace'],
      technical_boundaries: ['rust-domain', 'seaorm-store', 'axum-api'],
      steps: [
        { id: 'domain-q1', real_boundaries: ['rust-domain'] },
        {
          id: 'api-q2',
          replaced_boundaries: [
            { boundary: 'seaorm-store', test_double: 'fake' },
          ],
        },
      ],
    });
    expect(
      materializeFocusedCommands(process, { test_filter: 'SC-008' }),
    ).toEqual([
      {
        step_id: 'domain-q1',
        command: 'cargo test -p evidence-server SC-008',
      },
      {
        step_id: 'api-q2',
        command: 'cargo test -p evidence-server SC-008',
      },
    ]);
  });

  it('rejects a process that does not provide both support quadrants', () => {
    const cwd = workspace();
    write(
      cwd,
      'process.json',
      JSON.stringify({
        ...validProcessV2,
        steps: [validProcessV2.steps[0]],
      }),
    );

    expect(() => readTestProcess(`${cwd}/process.json`)).toThrow(
      'at least one Q2',
    );
  });

  it('rejects undeclared command variables and unsafe materialized values', () => {
    const cwd = workspace();
    const invalid = structuredClone(validProcessV2);
    invalid.steps[0].focused_command = {
      template: 'cargo test {{shell}}',
      allowed_variables: ['shell'],
    };
    write(cwd, 'invalid.json', JSON.stringify(invalid));

    expect(() => readTestProcess(`${cwd}/invalid.json`)).toThrow(
      'unsupported variable',
    );

    write(cwd, 'valid.json', JSON.stringify(validProcessV2));
    const process = readTestProcess(`${cwd}/valid.json`);
    expect(() => materializeFocusedCommands(process, {})).toThrow(
      'test_filter is required',
    );
    expect(() =>
      materializeFocusedCommands(process, {
        test_filter: 'SC-008;rm',
      }),
    ).toThrow('unsafe value');
  });

  it('reports zero and multiple matches using capabilities and technical boundaries independently', () => {
    const cwd = workspace();
    write(cwd, 'processes/one.json', JSON.stringify(validProcessV2));

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
      JSON.stringify({ ...validProcessV2, id: 'rust-workspace-v2-copy' }),
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

  it('rejects capabilities that are confused with runtime technical boundaries', () => {
    const cwd = workspace();
    write(
      cwd,
      'engineering/evidence-orchestrator/runtime-contexts.json',
      JSON.stringify({
        version: 2,
        functional_contexts: [{ id: 'logical-model' }],
        technical_boundaries: {
          rust: ['rust-domain', 'seaorm-store', 'axum-api'],
        },
      }),
    );
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/process.json',
      JSON.stringify(validProcessV2),
    );

    expect(() =>
      validateTestProcessDirectory(
        `${cwd}/engineering/evidence-orchestrator/test-processes`,
      ),
    ).toThrow('functional context outside');
  });

  it('ships one valid v2 process for every supported runtime route', () => {
    const definitions = validateTestProcessDirectory(
      join(process.cwd(), 'engineering/evidence-orchestrator/test-processes'),
    );

    expect(definitions).toHaveLength(4);
    expect(definitions.every(({ version }) => version === 2)).toBe(true);
    expect(new Set(definitions.map(({ runtime }) => runtime))).toEqual(
      new Set(['rust', 'typescript', 'tauri']),
    );
    expect(
      matchingTestProcesses(
        process.cwd(),
        join(process.cwd(), 'engineering/evidence-orchestrator/test-processes'),
        'typescript',
        ['workspace'],
      ),
    ).toHaveLength(2);
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
