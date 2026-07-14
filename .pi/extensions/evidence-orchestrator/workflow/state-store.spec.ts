import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE, IDLE_STATE } from './phase-catalog';
import {
  initialIterationState,
  readState,
  selectTestProcess,
  selectWorkItem,
  writeState,
} from './state-store';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

const PROCESS = {
  version: 1,
  id: 'web',
  applies_to: { runtime: 'typescript', functional_contexts: ['shell'] },
  steps: [
    {
      id: 'q1',
      quadrant: 'Q1',
      functional_context: 'shell',
      test_double: 'stub',
      task: 'Component test.',
    },
    {
      id: 'q2',
      quadrant: 'Q2',
      functional_context: 'shell',
      test_double: 'real',
      task: 'Acceptance test.',
    },
  ],
  quality_gates: ['pnpm test'],
};

describe('v2 state', () => {
  it('uses idle state when no iteration exists', () => {
    const cwd = workspace();
    expect(readState(cwd)).toEqual(IDLE_STATE);
  });

  it('constructs a clean single-Story iteration state', () => {
    expect(initialIterationState('ITER-0042')).toMatchObject({
      version: 2,
      iteration_id: 'ITER-0042',
      phase: 'kickoff',
    });
  });

  it('rejects legacy state instead of migrating it', () => {
    const cwd = workspace();
    expect(() =>
      writeState(cwd, { ...DEFAULT_STATE, version: 1 } as never),
    ).toThrow('legacy state is not migrated');
  });

  it('allows only one pending TQA Question during Discover', () => {
    const cwd = workspace();
    const pending = {
      question_id: 'Q-001',
      story_id: 'US-001',
      thought: 'The outcome is unclear.',
      question: 'What is visible?',
      asked_at: '2026-01-01T00:00:00.000Z',
    };
    expect(() =>
      writeState(cwd, { ...DEFAULT_STATE, pending_clarification: pending }),
    ).toThrow('pending TQA clarification is invalid');
    expect(
      writeState(cwd, {
        ...DEFAULT_STATE,
        phase: 'discover',
        pending_clarification: pending,
      }).pending_clarification,
    ).toEqual(pending);
  });

  it('selects one acceptance Scenario before its unique process', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    writeState(cwd, { ...DEFAULT_STATE, phase: 'build' });
    writeIterationArtifact(
      cwd,
      '02-discovery/examples/US-001-SC-001.md',
      'Given x\nWhen y\nThen z\n',
    );
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/web.json',
      JSON.stringify(PROCESS),
    );
    writeIterationArtifact(
      cwd,
      '04-design/scenario-context-map.json',
      JSON.stringify({
        version: 1,
        scenarios: [
          {
            story_id: 'US-001',
            scenario_id: 'SC-001',
            runtimes: [
              {
                runtime: 'typescript',
                functional_contexts: ['shell'],
                q1_tests: ['component'],
                q2_tests: ['acceptance'],
                test_doubles: ['stub'],
                candidate_process_ids: ['web'],
              },
            ],
          },
        ],
      }),
    );

    expect(() => selectTestProcess(cwd, 'typescript', ['shell'])).toThrow(
      'select one US-xxx',
    );
    selectWorkItem(cwd, 'US-001', 'SC-001');
    const selected = selectTestProcess(cwd, 'typescript', ['shell']);
    expect(selected.active_work_item?.test_plan?.processes[0]?.id).toBe('web');
    expect(readState(cwd).active_work_item?.test_plan?.processes).toHaveLength(
      1,
    );
  });
});
