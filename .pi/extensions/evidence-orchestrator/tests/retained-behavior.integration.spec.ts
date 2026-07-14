import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateScenarioContextMap } from '../evidence/knowledge';
import {
  answerClarification,
  askClarification,
  selectClarificationStory,
} from '../requirements/clarifications';
import {
  checkIssueSourceDrift,
  startIterationFromIssue,
} from '../requirements/github-issue';
import { executeTestStep } from '../testing/execution-recorder';
import {
  readState,
  selectTestProcess,
  selectWorkItem,
  writeState,
} from '../workflow/state-store';
import type { WorkflowState } from '../workflow/types';
import { V4_STATE_FIXTURES } from './fixtures/v4-states';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
  writeIterationArtifact,
} from './support';

function issueRunner(body = 'As a modeler, I need safe deletion.') {
  return (args: string[]) => {
    if (args[0] === 'repo') {
      return JSON.stringify({ nameWithOwner: 'owner/evidence' });
    }
    return JSON.stringify({
      number: 42,
      title: 'Safely delete a logical entity',
      body,
      url: 'https://github.com/owner/evidence/issues/42',
      state: 'OPEN',
      author: { login: 'domain-expert' },
      labels: [{ name: 'evidence:ready' }],
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-12T00:00:00Z',
    });
  };
}

function processDefinition(
  id: string,
  runtime: 'rust' | 'typescript',
  context: string,
  command = 'node -e "process.exit(0)"',
): string {
  return JSON.stringify({
    version: 1,
    id,
    applies_to: { runtime, functional_contexts: [context] },
    steps: [
      {
        id: `${id}-q1`,
        quadrant: 'Q1',
        functional_context: context,
        test_double: 'fake',
        task: 'Verify the component behavior.',
      },
      {
        id: `${id}-q2`,
        quadrant: 'Q2',
        functional_context: context,
        test_double: 'real',
        task: 'Verify the acceptance behavior.',
      },
    ],
    quality_gates: [command],
  });
}

function prepareClarification(cwd: string): void {
  const state = V4_STATE_FIXTURES[2] as WorkflowState;
  writeState(cwd, state);
  writeIterationArtifact(cwd, '01-requirements/product-context-delta.md');
  writeIterationArtifact(cwd, '01-requirements/stories/US-001.md');
  selectClarificationStory(cwd, 'US-001');
}

afterEach(cleanupWorkspaces);

describe('retained Evidence Orchestrator behavior', () => {
  it('detects Issue drift without mutating the frozen snapshot or projection', () => {
    const cwd = workspace();
    const state = startIterationFromIssue(
      cwd,
      { issueNumber: 42 },
      issueRunner(),
    );
    const source = state.requirement_source;
    if (!source) throw new Error('Expected an Issue requirement source.');
    const snapshotBefore = readFileSync(
      join(cwd, source.snapshot_path),
      'utf8',
    );
    const projectionBefore = readFileSync(
      join(cwd, source.projection_path),
      'utf8',
    );

    expect(
      checkIssueSourceDrift(cwd, issueRunner('Changed remotely.')),
    ).toEqual(expect.objectContaining({ changed: true }));
    expect(readFileSync(join(cwd, source.snapshot_path), 'utf8')).toBe(
      snapshotBefore,
    );
    expect(readFileSync(join(cwd, source.projection_path), 'utf8')).toBe(
      projectionBefore,
    );
  });

  it('keeps exactly one unanswered TQA question pending', () => {
    const cwd = workspace();
    prepareClarification(cwd);

    const asked = askClarification(cwd, {
      story_id: 'US-001',
      question: 'Who approves publication?',
      target: 'business_context',
    });

    expect(asked.pending_clarification).toEqual(
      expect.objectContaining({ question_id: 'Q-001' }),
    );
    expect(asked.pending_clarification?.answer).toBeUndefined();
    expect(() =>
      askClarification(cwd, {
        story_id: 'US-001',
        question: 'Who can revoke approval?',
        target: 'story',
      }),
    ).toThrow('pending clarification Q-001');
  });

  it('routes human answers to business context, story, and history', () => {
    const cwd = workspace();
    prepareClarification(cwd);

    for (const [target, question, answer] of [
      ['business_context', 'Who approves publication?', 'The owner.'],
      ['story', 'Can approval be delegated?', 'No.'],
      ['history', 'Why is this decision retained?', 'For this iteration.'],
    ] as const) {
      askClarification(cwd, {
        story_id: 'US-001',
        question,
        target,
      });
      answerClarification(cwd, answer);
    }

    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/product-context-delta.md',
        ),
        'utf8',
      ),
    ).toContain('The owner.');
    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
        ),
        'utf8',
      ),
    ).toContain('No.');
    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/clarifications/US-001.md',
        ),
        'utf8',
      ),
    ).toContain('For this iteration.');
  });

  it('records command outcomes and hashes observed by the execution tool', () => {
    const cwd = workspace();
    const command =
      "node -e \"process.stdout.write('observed stdout'); process.stderr.write('observed stderr'); process.exit(1)\"";
    initializeGitRepository(cwd);
    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/web.json',
      processDefinition('web', 'typescript', 'web-feature', command),
    );
    writeState(cwd, {
      ...V4_STATE_FIXTURES[2],
      phase: 'coding',
    });
    selectWorkItem(cwd, 'US-001', 'SC-001');
    selectTestProcess(cwd, 'typescript', ['web-feature']);

    const record = executeTestStep(cwd, {
      processId: 'web',
      stage: 'red',
      command,
    });

    expect(record).toMatchObject({
      exit_code: 1,
      expected_failure: true,
      stdout_sha256: createHash('sha256')
        .update('observed stdout')
        .digest('hex'),
      stderr_sha256: createHash('sha256')
        .update('observed stderr')
        .digest('hex'),
      git_head: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd,
        encoding: 'utf8',
      }).trim(),
    });
    expect(record.worktree_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reads complete, halted, and active v4 states without rewriting or migrating them', () => {
    for (const fixture of V4_STATE_FIXTURES) {
      const cwd = workspace();
      const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
      write(cwd, 'evidence-state.json', serialized);

      const state = readState(cwd);

      expect(state.phase).toBe(fixture.phase);
      expect(state.pi?.version).toBe(4);
      expect(readFileSync(join(cwd, 'evidence-state.json'), 'utf8')).toBe(
        serialized,
      );
    }
  });

  it('rejects a scenario that mixes the Rust and Nest server tracks', () => {
    const cwd = workspace();
    write(
      cwd,
      'engineering/evidence-orchestrator/runtime-contexts.json',
      JSON.stringify({
        version: 1,
        runtimes: {
          rust: ['rust-api'],
          typescript: ['nest-api'],
        },
      }),
    );
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/rust.json',
      processDefinition('rust-server', 'rust', 'rust-api'),
    );
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/nest.json',
      processDefinition('nest-server', 'typescript', 'nest-api'),
    );
    write(
      cwd,
      'scenario-context-map.json',
      JSON.stringify({
        version: 1,
        scenarios: [
          {
            story_id: 'US-001',
            scenario_id: 'SC-001',
            runtimes: [
              {
                runtime: 'rust',
                functional_contexts: ['rust-api'],
                q1_tests: ['Rust support behavior'],
                q2_tests: ['Rust acceptance behavior'],
                test_doubles: ['fake'],
                candidate_process_ids: ['rust-server'],
              },
              {
                runtime: 'typescript',
                functional_contexts: ['nest-api'],
                q1_tests: ['Nest support behavior'],
                q2_tests: ['Nest acceptance behavior'],
                test_doubles: ['fake'],
                candidate_process_ids: ['nest-server'],
              },
            ],
          },
        ],
      }),
    );

    expect(() =>
      validateScenarioContextMap(cwd, `${cwd}/scenario-context-map.json`),
    ).toThrow('must not mix the Rust and Nest server tracks');
  });
});
