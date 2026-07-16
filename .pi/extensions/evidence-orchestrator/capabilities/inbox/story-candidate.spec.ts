import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupWorkspaces, workspace } from '../../test-support/support';
import { captureInboxSource } from './repository';
import {
  inboxCandidateStatus,
  listInboxCandidateDecisions,
  listInboxStoryCandidates,
  proposeInboxStoryCandidates,
  recordInboxCandidateDecision,
  validateInboxStoryCandidates,
} from './story-candidate';

afterEach(cleanupWorkspaces);

function source(cwd: string, key = 'manual:interview', body = 'Owner note.') {
  return captureInboxSource(cwd, {
    source_kind: 'manual_text',
    external_key: key,
    title: 'Domain interview',
    body,
    content_type: 'text/plain',
  });
}

function proposal(inboxId: string, revisionSha256: string) {
  return {
    title: 'Preserve deletion evidence',
    problem: 'The owner cannot prove what was deleted.',
    role: 'workspace owner',
    goal: 'retain deletion evidence',
    value: 'support an audit',
    cognitiveMode: 'complex' as const,
    citations: [
      {
        inboxId,
        revisionSha256,
        locator: 'whole source',
      },
    ],
  };
}

describe('Inbox Story candidates', () => {
  it('persists an AI-authored candidate with exact revision citations', () => {
    const cwd = workspace();
    const captured = source(cwd);

    const [candidate] = proposeInboxStoryCandidates(
      cwd,
      [captured.item.inbox_id],
      [proposal(captured.item.inbox_id, captured.revision.content_sha256)],
      '2026-07-16T00:00:00Z',
    );

    expect(candidate).toMatchObject({
      candidate_id: 'CAND-0001',
      proposed_by: 'inbox-analyst',
      proposed_at: '2026-07-16T00:00:00Z',
      citations: [
        {
          inbox_id: 'INBOX-0001',
          revision_sha256: captured.revision.content_sha256,
        },
      ],
    });
    expect(candidate).not.toHaveProperty('story_id');
    expect(candidate.content_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(inboxCandidateStatus(cwd, candidate)).toBe('ready');
    expect(listInboxStoryCandidates(cwd)).toEqual([candidate]);
  });

  it('requires every selected source to be cited by the candidate set', () => {
    const cwd = workspace();
    const first = source(cwd, 'manual:first');
    const second = source(cwd, 'manual:second');

    expect(() =>
      proposeInboxStoryCandidates(
        cwd,
        [first.item.inbox_id, second.item.inbox_id],
        [proposal(first.item.inbox_id, first.revision.content_sha256)],
      ),
    ).toThrow('did not cite selected Inbox sources: INBOX-0002');
  });

  it('marks a candidate stale when a cited source receives a new revision', () => {
    const cwd = workspace();
    const first = source(cwd);
    const [candidate] = proposeInboxStoryCandidates(
      cwd,
      [first.item.inbox_id],
      [proposal(first.item.inbox_id, first.revision.content_sha256)],
    );

    source(cwd, 'manual:interview', 'The interview note changed.');

    expect(inboxCandidateStatus(cwd, candidate)).toBe('stale');
    expect(() => validateInboxStoryCandidates(cwd)).not.toThrow();
  });

  it('rejects citations to unselected or superseded revisions', () => {
    const cwd = workspace();
    const first = source(cwd, 'manual:first');
    const second = source(cwd, 'manual:second');
    source(cwd, 'manual:first', 'Updated owner note.');

    expect(() =>
      proposeInboxStoryCandidates(
        cwd,
        [first.item.inbox_id],
        [proposal(second.item.inbox_id, second.revision.content_sha256)],
      ),
    ).toThrow('unselected Inbox item');
    expect(() =>
      proposeInboxStoryCandidates(
        cwd,
        [first.item.inbox_id],
        [proposal(first.item.inbox_id, first.revision.content_sha256)],
      ),
    ).toThrow('must cite the latest Inbox revision');
  });

  it('records human defer and reject decisions outside workflow state', () => {
    const cwd = workspace();
    const captured = source(cwd);
    const [candidate] = proposeInboxStoryCandidates(
      cwd,
      [captured.item.inbox_id],
      [proposal(captured.item.inbox_id, captured.revision.content_sha256)],
    );

    const decision = recordInboxCandidateDecision(
      cwd,
      candidate.candidate_id,
      'deferred',
      'The domain expert is unavailable.',
      '2026-07-16T00:00:00Z',
    );

    expect(decision).toMatchObject({
      decision_id: 'DECISION-0001',
      action: 'deferred',
      decided_by: 'human',
    });
    expect(inboxCandidateStatus(cwd, candidate)).toBe('deferred');
    expect(listInboxCandidateDecisions(cwd)).toEqual([decision]);
    expect(() =>
      recordInboxCandidateDecision(
        cwd,
        candidate.candidate_id,
        'rejected',
        'Changed decision.',
      ),
    ).toThrow('already deferred');
  });

  it('detects manual candidate mutation during offline validation', () => {
    const cwd = workspace();
    const captured = source(cwd);
    const [candidate] = proposeInboxStoryCandidates(
      cwd,
      [captured.item.inbox_id],
      [proposal(captured.item.inbox_id, captured.revision.content_sha256)],
    );
    const path = join(cwd, candidate.artifact_path);
    const persisted = JSON.parse(readFileSync(path, 'utf8')) as object;
    writeFileSync(
      path,
      `${JSON.stringify({ ...persisted, goal: 'mutated' }, null, 2)}\n`,
    );

    expect(() => validateInboxStoryCandidates(cwd)).toThrow(
      'candidate hash is inconsistent',
    );
  });
});
