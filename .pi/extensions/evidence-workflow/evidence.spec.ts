import { afterEach, describe, expect, it } from 'vitest';
import {
  createCodingGitBaseline,
  validateScenarioExecutionEvidence,
} from './evidence';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
} from './test-support';

afterEach(cleanupWorkspaces);

describe('evidence', () => {
  it('captures a Git baseline only for a clean code tree', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    expect(createCodingGitBaseline(cwd)).toMatch(/^[0-9a-f]{40}$/);
    write(cwd, 'apps/web/src/app.tsx');
    expect(() => createCodingGitBaseline(cwd)).toThrow(
      'pre-existing code changes',
    );
  });

  it('requires a selected test process for scenario execution evidence', () => {
    const cwd = workspace();
    expect(() =>
      validateScenarioExecutionEvidence(cwd, {
        story_id: 'US-001',
        scenario_id: 'SC-001',
        git_baseline: 'baseline',
      }),
    ).toThrow('has no test process');
  });
});
