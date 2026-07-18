import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBoard } from '../../iteration/board-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../../test-support/support';
import {
  startIterationFromCandidate,
  validateIterationIntakeSnapshot,
} from './iteration-intake';
import { captureInboxSource } from './repository';
import { proposeInboxStoryCandidates } from './story-candidate';

afterEach(cleanupWorkspaces);

function gitWorkspace(): string {
  const cwd = workspace();
  initializeGitRepository(cwd);
  return cwd;
}

function candidate(cwd: string) {
  const source = captureInboxSource(cwd, {
    source_kind: 'manual_text',
    external_key: 'manual:interview',
    title: 'Domain interview',
    body: 'The owner needs an audit trail.',
  });
  return {
    source,
    candidate: proposeInboxStoryCandidates(
      cwd,
      ['INBOX-0001'],
      [
        {
          title: 'Retain deletion evidence',
          problem: 'Deletion is not auditable.',
          role: 'workspace owner',
          goal: 'retain deletion evidence',
          value: 'support an audit',
          cognitiveMode: 'complex',
          citations: [
            {
              inboxId: 'INBOX-0001',
              revisionSha256: source.revision.content_sha256,
              locator: 'whole source',
            },
          ],
        },
      ],
    )[0],
  };
}

function onlyWorktree(cwd: string): string {
  const path = readBoard(cwd).items[0]?.worktree_path;
  if (!path) throw new Error('Expected one provisioned worktree.');
  return path;
}

describe('Iteration Inbox Intake', () => {
  it('freezes one ready candidate and its exact revisions into a new worktree', () => {
    const cwd = gitWorkspace();
    const selected = candidate(cwd);

    const state = startIterationFromCandidate(
      cwd,
      selected.candidate.candidate_id,
      '2026-07-16T00:00:00Z',
    );
    const worktree = onlyWorktree(cwd);

    expect(state).toMatchObject({
      iteration_id: 'ITER-0001',
      loop: 'kickoff',
      intake_snapshot: {
        version: 1,
        candidate_id: 'CAND-0001',
        frozen_at: '2026-07-16T00:00:00Z',
        projection_path:
          'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
        source_revisions: [
          {
            inbox_id: 'INBOX-0001',
            revision_sha256: selected.source.revision.content_sha256,
          },
        ],
      },
      kickoff_candidate: {
        title: 'Retain deletion evidence',
        artifact_path:
          'artifacts/iterations/ITER-0001/01-requirements/kickoff-candidates/CAND-001.json',
      },
    });
    expect(state).not.toHaveProperty('requirement_source');
    expect(
      readFileSync(
        join(worktree, state.intake_snapshot?.projection_path ?? ''),
        'utf8',
      ),
    ).toContain('此文件由冻结的 Evidence Inbox Intake 自动生成');
    expect(() =>
      validateIterationIntakeSnapshot(worktree, state),
    ).not.toThrow();
  });

  it('does not reuse a Candidate claimed by another Board item', () => {
    const cwd = gitWorkspace();
    candidate(cwd);
    startIterationFromCandidate(cwd, 'CAND-0001');

    expect(() => startIterationFromCandidate(cwd, 'CAND-0001')).toThrow(
      'is selected',
    );
  });

  it('rejects a stale candidate instead of silently changing its citations', () => {
    const cwd = gitWorkspace();
    const selected = candidate(cwd);
    captureInboxSource(cwd, {
      source_kind: 'manual_text',
      external_key: 'manual:interview',
      title: 'Domain interview',
      body: 'The interview changed after extraction.',
    });

    expect(() =>
      startIterationFromCandidate(cwd, selected.candidate.candidate_id),
    ).toThrow('is stale');
    expect(existsSync(join(cwd, '.evidence-iteration-state.json'))).toBe(false);
    expect(readBoard(cwd).items).toEqual([]);
  });

  it('detects mutation using only the self-contained iteration snapshot', () => {
    const cwd = gitWorkspace();
    candidate(cwd);
    const state = startIterationFromCandidate(cwd, 'CAND-0001');
    const worktree = onlyWorktree(cwd);
    const sourcePath =
      state.intake_snapshot?.source_revisions[0].snapshot_path ?? '';
    const persisted = JSON.parse(
      readFileSync(join(worktree, sourcePath), 'utf8'),
    ) as object;
    writeFileSync(
      join(worktree, sourcePath),
      `${JSON.stringify({ ...persisted, body: 'mutated' }, null, 2)}\n`,
    );

    expect(() => validateIterationIntakeSnapshot(worktree, state)).toThrow(
      'source revision is inconsistent',
    );
  });
});
