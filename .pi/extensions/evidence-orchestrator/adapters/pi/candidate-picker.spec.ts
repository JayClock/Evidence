import { afterEach, describe, expect, it, vi } from 'vitest';
import { startIterationFromCandidate } from '../../capabilities/inbox/iteration-intake';
import { captureInboxSource } from '../../capabilities/inbox/repository';
import { proposeInboxStoryCandidates } from '../../capabilities/inbox/story-candidate';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../../test-support/support';
import {
  requireCandidateId,
  selectReadyInboxCandidate,
} from './candidate-picker';

afterEach(cleanupWorkspaces);

function addCandidate(cwd: string): void {
  const source = captureInboxSource(cwd, {
    source_kind: 'manual_text',
    external_key: 'manual:interview',
    title: 'Interview',
    body: 'The owner needs an audit trail.',
  });
  proposeInboxStoryCandidates(
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
  );
}

describe('Inbox candidate picker', () => {
  it('returns the ready candidate selected by the human', async () => {
    const cwd = workspace();
    addCandidate(cwd);
    const select = vi
      .fn()
      .mockResolvedValue(
        'CAND-0001 · Retain deletion evidence · workspace owner · Problem: Deletion is not auditable.',
      );

    await expect(
      selectReadyInboxCandidate({
        cwd,
        hasUI: true,
        ui: { select },
      } as never),
    ).resolves.toBe('CAND-0001');
    expect(select).toHaveBeenCalledWith(
      'Select an Inbox Story candidate for the new iteration',
      [
        'CAND-0001 · Retain deletion evidence · workspace owner · Problem: Deletion is not auditable.',
      ],
    );
  });

  it('shows the complete selected problem before a TUI choice', async () => {
    const cwd = workspace();
    addCandidate(cwd);
    const requestRender = vi.fn();
    const select = vi.fn();
    const custom = vi.fn(
      async (
        factory: (
          tui: { requestRender: () => void },
          theme: {
            fg: (color: string, text: string) => string;
            bold: (text: string) => string;
          },
          keybindings: unknown,
          done: (value: string | null) => void,
        ) => {
          render(width: number): string[];
          handleInput(data: string): void;
        },
      ) => {
        let result: string | null | undefined;
        const component = factory(
          { requestRender },
          {
            fg: (_color, text) => text,
            bold: (text) => text,
          },
          {},
          (value) => {
            result = value;
          },
        );
        const rendered = component.render(120).join('\n');
        expect(rendered).toContain('Selected candidate problem');
        expect(rendered).toContain('Deletion is not auditable.');
        component.handleInput('enter');
        return result;
      },
    );

    await expect(
      selectReadyInboxCandidate({
        cwd,
        mode: 'tui',
        hasUI: true,
        ui: { custom, select },
      } as never),
    ).resolves.toBe('CAND-0001');
    expect(custom).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
    expect(requestRender).toHaveBeenCalledOnce();
  });

  it('does not offer candidates made stale by a newer source revision', async () => {
    const cwd = workspace();
    addCandidate(cwd);
    captureInboxSource(cwd, {
      source_kind: 'manual_text',
      external_key: 'manual:interview',
      title: 'Interview',
      body: 'The interview changed.',
    });

    await expect(
      selectReadyInboxCandidate({
        cwd,
        hasUI: true,
        ui: { select: vi.fn() },
      } as never),
    ).rejects.toThrow('No ready Inbox Story candidate');
  });

  it('does not offer a candidate already selected by an iteration', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    addCandidate(cwd);
    startIterationFromCandidate(cwd, 'CAND-0001');

    await expect(
      selectReadyInboxCandidate({
        cwd,
        hasUI: true,
        ui: { select: vi.fn() },
      } as never),
    ).rejects.toThrow('No ready Inbox Story candidate');
  });

  it('requires an explicit candidate id outside interactive mode', async () => {
    expect(requireCandidateId('cand-0012')).toBe('CAND-0012');
    expect(() => requireCandidateId('#12')).toThrow('must be CAND-xxxx');
    await expect(
      selectReadyInboxCandidate({ hasUI: false } as never),
    ).rejects.toThrow('requires CAND-xxxx');
  });
});
