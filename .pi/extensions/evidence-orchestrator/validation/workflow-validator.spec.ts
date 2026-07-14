import { afterEach, describe, expect, it } from 'vitest';
import { CANONICAL_KNOWLEDGE_PATHS } from '../evidence/knowledge';
import { DEFAULT_STATE, IDLE_STATE } from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  workspace,
  write,
  writeIterationArtifact,
} from '../tests/support';
import { validateWorkflow } from './workflow-validator';

afterEach(cleanupWorkspaces);

function canonicalProject(cwd: string): void {
  for (const path of CANONICAL_KNOWLEDGE_PATHS) write(cwd, path, 'knowledge');
  write(
    cwd,
    'engineering/evidence-orchestrator/test-processes/web.json',
    JSON.stringify({
      version: 1,
      id: 'web',
      applies_to: {
        runtime: 'typescript',
        functional_contexts: ['web'],
      },
      steps: [
        {
          id: 'q1',
          quadrant: 'Q1',
          functional_context: 'web',
          test_double: 'stub',
          task: 'Component test.',
        },
        {
          id: 'q2',
          quadrant: 'Q2',
          functional_context: 'web',
          test_double: 'real',
          task: 'Acceptance test.',
        },
      ],
      quality_gates: ['pnpm test'],
    }),
  );
}

describe('workflow validator', () => {
  it('validates canonical knowledge while idle', () => {
    const cwd = workspace();
    canonicalProject(cwd);
    writeState(cwd, IDLE_STATE);
    expect(() => validateWorkflow(cwd)).not.toThrow();
  });

  it('rejects a missing active iteration root', () => {
    const cwd = workspace();
    canonicalProject(cwd);
    writeState(cwd, DEFAULT_STATE);
    expect(() => validateWorkflow(cwd)).toThrow(
      'Iteration artifact root is missing',
    );
  });

  it('rejects an active iteration without a frozen Issue', () => {
    const cwd = workspace();
    canonicalProject(cwd);
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-input/requirements.md');
    expect(() => validateWorkflow(cwd)).toThrow('no frozen GitHub Issue');
  });
});
