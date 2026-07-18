import { afterEach, describe, expect, it, vi } from 'vitest';
import { provisionWorkItem } from '../../capabilities/work-item-worktree/provisioner';
import { DEFAULT_STATE } from '../../iteration/default-state';
import {
  readPersistedState,
  writeState,
} from '../../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../../test-support/support';
import evidenceOrchestratorExtension from './host';

afterEach(cleanupWorkspaces);

describe('multi-Story host', () => {
  it('projects and watches the Board without reading a primary singleton State', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const first = provisionWorkItem(
      cwd,
      'CAND-0001',
      ({ iterationId, worktreeRoot }) => {
        writeState(worktreeRoot, {
          ...DEFAULT_STATE,
          iteration_id: iterationId,
        });
      },
    );
    provisionWorkItem(cwd, 'CAND-0002', ({ iterationId, worktreeRoot }) => {
      writeState(worktreeRoot, {
        ...DEFAULT_STATE,
        iteration_id: iterationId,
      });
    });

    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: unknown) => void>
    >();
    const setActiveTools = vi.fn();
    const pi = {
      on(name: string, handler: (event: unknown, ctx: unknown) => void) {
        const registered = handlers.get(name) ?? [];
        registered.push(handler);
        handlers.set(name, registered);
      },
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      registerEntryRenderer: vi.fn(),
      registerMessageRenderer: vi.fn(),
      getActiveTools: () => ['read'],
      setActiveTools,
    };
    const ui = {
      setStatus: vi.fn(),
      setWidget: vi.fn(),
      notify: vi.fn(),
    };
    evidenceOrchestratorExtension(pi as never);
    const sessionStart = handlers.get('session_start')?.[0];
    const sessionShutdown = handlers.get('session_shutdown')?.[0];
    if (!sessionStart || !sessionShutdown) {
      throw new Error('Host lifecycle handlers were not registered.');
    }

    sessionStart(undefined, { cwd, ui });

    expect(readPersistedState(cwd)).toBeUndefined();
    expect(ui.setStatus).toHaveBeenCalledWith(
      'evidence-orchestrator',
      'orchestrator:active=2/3:delivery=0/1',
    );
    expect(ui.setWidget).toHaveBeenCalledWith(
      'evidence-orchestrator-next-step',
      [expect.stringContaining('Active 2/3')],
      { placement: 'belowEditor' },
    );
    expect(setActiveTools).toHaveBeenCalledWith(
      expect.arrayContaining([
        'read',
        'evidence_orchestrator_status',
        'evidence_orchestrator_run_activity',
      ]),
    );

    const callsBeforeStateChange = ui.setStatus.mock.calls.length;
    writeState(first.worktree.path, {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
    });
    await vi.waitFor(
      () => {
        expect(ui.setStatus.mock.calls.length).toBeGreaterThan(
          callsBeforeStateChange,
        );
      },
      { timeout: 2_000, interval: 50 },
    );

    sessionShutdown(undefined, { cwd, ui });
    expect(ui.setWidget).toHaveBeenLastCalledWith(
      'evidence-orchestrator-next-step',
      undefined,
    );
  });
});
