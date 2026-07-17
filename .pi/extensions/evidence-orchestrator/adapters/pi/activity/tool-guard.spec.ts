import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_CHILD_ENV,
  ACTIVITY_POLICY_ENV,
  createActivityToolPolicy,
} from '../../../capabilities/worktree-protection/activity-tool-policy';
import { workspace } from '../../../test-support/support';
import { registerActivityToolGuard } from './tool-guard';

describe('activity tool guard adapter', () => {
  it('does not affect the parent Pi process', () => {
    const on = vi.fn();
    registerActivityToolGuard({ on } as never, {});
    expect(on).not.toHaveBeenCalled();
  });

  it('blocks a child tool before execution when policy rejects it', () => {
    const cwd = workspace();
    const policyPath = join(cwd, 'policy.json');
    writeFileSync(
      policyPath,
      JSON.stringify(
        createActivityToolPolicy({
          cwd,
          role: 'showcase-reviewer',
          timeoutMs: 900_000,
        }),
      ),
    );
    let handler:
      | ((event: {
          toolName: string;
          input: unknown;
        }) => { block: true; reason?: string } | undefined)
      | undefined;
    registerActivityToolGuard(
      {
        on(name: string, candidate: typeof handler) {
          if (name === 'tool_call') handler = candidate;
        },
      } as never,
      {
        [ACTIVITY_CHILD_ENV]: '1',
        [ACTIVITY_POLICY_ENV]: policyPath,
      },
    );

    expect(
      handler?.({ toolName: 'read', input: { path: 'README.md' } }),
    ).toBeUndefined();
    expect(
      handler?.({ toolName: 'write', input: { path: 'README.md' } }),
    ).toMatchObject({ block: true });
    expect(
      handler?.({ toolName: 'bash', input: { command: 'git status' } }),
    ).toMatchObject({ block: true });
  });

  it('fails closed when a child policy cannot be loaded', () => {
    let handler:
      | ((event: {
          toolName: string;
          input: unknown;
        }) => { block: true; reason?: string } | undefined)
      | undefined;
    registerActivityToolGuard(
      {
        on(_name: string, candidate: typeof handler) {
          handler = candidate;
        },
      } as never,
      { [ACTIVITY_CHILD_ENV]: '1' },
    );

    expect(
      handler?.({
        toolName: 'evidence_orchestrator_propose_response',
        input: {},
      }),
    ).toMatchObject({
      block: true,
      reason: expect.stringContaining('fail-closed'),
    });
  });
});
