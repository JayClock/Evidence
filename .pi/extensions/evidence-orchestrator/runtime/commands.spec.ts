import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, PHASE_META } from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  workspace,
  write,
  writeIterationArtifact,
} from '../tests/support';
import { registerCommands } from './commands';

afterEach(cleanupWorkspaces);

describe('commands', () => {
  it('registers workflow, gate, and explicit TQA-answer commands', () => {
    const commands: string[] = [];
    registerCommands({
      registerCommand(name: string) {
        commands.push(name);
      },
    } as never);

    expect(commands).toEqual(
      expect.arrayContaining([
        'evidence-run',
        'evidence-new',
        'evidence-gate',
        'evidence-answer',
        'evidence-issue-sync',
        'evidence-issue-status',
      ]),
    );
  });

  it('routes evidence-run through the visible phase tool in the current conversation', async () => {
    const cwd = workspace();
    for (const path of PHASE_META.frame.inputs) {
      write(
        cwd,
        path.startsWith('artifacts/')
          ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
          : path,
        'input',
      );
    }
    writeIterationArtifact(cwd, '00-user-input/requirements.md', 'input');
    writeState(cwd, {
      ...DEFAULT_STATE,
      requirement_source: {
        type: 'github_issue',
        repository: 'owner/repo',
        issue_number: 1,
        url: 'https://example.test/issues/1',
        snapshot_path:
          'artifacts/iterations/ITER-0001/00-user-input/issue.json',
        projection_path:
          'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
        content_hash: 'sha256:test',
        issue_updated_at: '2026-01-01T00:00:00.000Z',
        fetched_at: '2026-01-01T00:00:00.000Z',
      },
    });

    let run: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const sendUserMessage = vi.fn();
    registerCommands({
      registerCommand(name: string, options: { handler: typeof run }) {
        if (name === 'evidence-run') run = options.handler;
      },
      sendUserMessage,
    } as never);

    await run?.('', {
      cwd,
      isIdle: () => true,
      ui: { notify: vi.fn(), setStatus: vi.fn() },
    });

    expect(sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining('evidence_orchestrator_run_phase'),
    );
  });
});
