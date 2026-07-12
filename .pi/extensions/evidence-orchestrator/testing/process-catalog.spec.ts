import { afterEach, describe, expect, it } from 'vitest';
import {
  matchingTestProcesses,
  readTestProcess,
  validateTestProcessDirectory,
} from './process-catalog';
import { cleanupWorkspaces, workspace, write } from '../tests/support';

afterEach(cleanupWorkspaces);

const validProcess = {
  version: 1,
  id: 'rust-api',
  applies_to: { runtime: 'rust', functional_contexts: ['domain', 'api'] },
  steps: [
    {
      id: 'domain',
      quadrant: 'Q1',
      functional_context: 'domain',
      test_double: 'real',
      task: 'Test domain behavior.',
    },
    {
      id: 'api',
      quadrant: 'Q2',
      functional_context: 'api',
      test_double: 'stub',
      task: 'Test acceptance behavior.',
    },
  ],
  quality_gates: ['cargo test -p evidence-server'],
};

describe('test-processes', () => {
  it('parses a process with an explicit Q1/Q2 strategy', () => {
    const cwd = workspace();
    const path = `${cwd}/process.json`;
    write(cwd, 'process.json', JSON.stringify(validProcess));
    expect(readTestProcess(path)).toMatchObject({ id: 'rust-api', version: 1 });
  });

  it('rejects a process that does not provide both support quadrants', () => {
    const cwd = workspace();
    write(
      cwd,
      'process.json',
      JSON.stringify({ ...validProcess, steps: [validProcess.steps[0]] }),
    );
    expect(() => readTestProcess(`${cwd}/process.json`)).toThrow(
      'at least one Q2',
    );
  });

  it('selects only processes that cover every requested functional context', () => {
    const cwd = workspace();
    write(cwd, 'processes/rust-api.json', JSON.stringify(validProcess));
    expect(
      matchingTestProcesses(cwd, `${cwd}/processes`, 'rust', ['domain', 'api']),
    ).toHaveLength(1);
    expect(validateTestProcessDirectory(`${cwd}/processes`)).toHaveLength(1);
  });
});
