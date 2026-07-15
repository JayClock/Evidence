import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkIssueSourceDrift,
  startIterationFromIssue,
  startIterationFromIssueAsync,
  syncIssueSource,
  validateIssueSourceSnapshot,
} from './github-issue-source';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { writeState } from '../../iteration/state-repository';
import { cleanupWorkspaces, workspace } from '../../tests/support';

afterEach(cleanupWorkspaces);

function runner(body = 'As a modeler, I need safe deletion.') {
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
      labels: [{ name: 'feature' }, { name: 'evidence:ready' }],
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-12T00:00:00Z',
    });
  };
}

describe('issue-source', () => {
  it('starts an isolated iteration from a GitHub Issue snapshot', () => {
    const cwd = workspace();

    const state = startIterationFromIssue(cwd, { issueNumber: 42 }, runner());

    expect(state).toMatchObject({
      workflow_version: 5,
      loop: 'kickoff',
      requirement_source: {
        type: 'github_issue',
        repository: 'owner/evidence',
        issue_number: 42,
        snapshot_path:
          'artifacts/iterations/ITER-0001/00-user-input/issue.json',
      },
    });
    expect(
      existsSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
        ),
      ),
    ).toBe(true);
    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
        ),
        'utf8',
      ),
    ).toContain('此文件由 GitHub Issue 自动生成，请勿手工维护');
    expect(() => validateIssueSourceSnapshot(cwd, state)).not.toThrow();

    const source = state.requirement_source;
    if (!source) throw new Error('Expected a GitHub Issue requirement source.');
    writeFileSync(
      join(cwd, source.projection_path),
      'manually edited requirement',
    );
    expect(() => validateIssueSourceSnapshot(cwd, state)).toThrow(
      'projection is stale or manually modified',
    );
  });

  it('refuses to replace any active iteration in place', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    expect(() =>
      startIterationFromIssue(cwd, { issueNumber: 42 }, runner()),
    ).toThrow(
      'Complete, reject, split, or defer it first; state is never migrated in place',
    );
  });

  it('starts an iteration through an asynchronous cancellable runner', async () => {
    const cwd = workspace();
    const signal = new AbortController().signal;
    const asyncRunner = async (
      args: string[],
      _cwd: string,
      observed?: AbortSignal,
    ) => {
      expect(observed).toBe(signal);
      return runner()(args);
    };

    const state = await startIterationFromIssueAsync(
      cwd,
      { issueNumber: 42 },
      asyncRunner,
      signal,
    );

    expect(state.requirement_source?.issue_number).toBe(42);
  });

  it('detects remote Issue drift without mutating the frozen snapshot', () => {
    const cwd = workspace();
    startIterationFromIssue(cwd, { issueNumber: 42 }, runner());

    const drift = checkIssueSourceDrift(
      cwd,
      runner('The business requirement changed.'),
    );

    expect(drift.changed).toBe(true);
    expect(drift.snapshot_hash).not.toBe(drift.remote_hash);
  });

  it('only refreshes the active snapshot while still in Kickoff', () => {
    const cwd = workspace();
    const initial = startIterationFromIssue(cwd, { issueNumber: 42 }, runner());
    const refreshed = syncIssueSource(
      cwd,
      runner('The clarified requirement.'),
    );
    expect(refreshed.requirement_source?.content_hash).not.toBe(
      initial.requirement_source?.content_hash,
    );

    writeState(cwd, {
      ...refreshed,
      loop: 'understand',
      understand_stage: 'tqa',
    });
    expect(() => syncIssueSource(cwd, runner('Another change.'))).toThrow(
      'Cannot refresh the Issue snapshot in understand',
    );
  });
});
