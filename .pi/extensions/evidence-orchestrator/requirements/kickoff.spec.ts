import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import { cleanupWorkspaces, workspace } from '../tests/support';
import { decideKickoff, proposeKickoffCandidate } from './kickoff';

function prepareKickoff(cwd: string): void {
  writeState(cwd, {
    ...DEFAULT_STATE,
    workflow_version: 5,
    loop: 'kickoff',
  });
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    title: '共享工作区模型',
    problem: '协作者无法确认哪个共享模型是当前有效版本。',
    role: '领域建模负责人',
    goal: '确认并共享当前有效的工作区模型',
    value: '让协作者依据同一业务模型开展讨论',
    cognitiveMode: 'complex' as const,
    sourceRefs: [
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      'docs/product/user-journeys.md#旅程-a',
    ],
    ...overrides,
  };
}

afterEach(cleanupWorkspaces);

describe('v5 Kickoff', () => {
  it('persists one candidate without assigning a Story id', () => {
    const cwd = workspace();
    prepareKickoff(cwd);

    const state = proposeKickoffCandidate(
      cwd,
      candidate(),
      '2026-01-01T00:00:00.000Z',
    );

    expect(state.kickoff_candidate).toMatchObject({
      title: '共享工作区模型',
      cognitive_mode: 'complex',
      artifact_path: expect.stringContaining('CAND-001.json'),
    });
    expect(
      existsSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
        ),
      ),
    ).toBe(false);
    expect(() => proposeKickoffCandidate(cwd, candidate())).toThrow(
      'awaiting a human decision',
    );
  });

  it('lets a human confirmation create exactly one Story and enter Understand', () => {
    const cwd = workspace();
    prepareKickoff(cwd);
    proposeKickoffCandidate(cwd, candidate());

    const state = decideKickoff(
      cwd,
      'confirmed',
      '该角色和价值是本轮唯一问题边界。',
      '2026-01-01T00:01:00.000Z',
    );

    expect(state).toMatchObject({
      workflow_version: 5,
      loop: 'understand',
      phase: 'clarify',
      active_clarification_story: { story_id: 'US-001' },
    });
    expect(state.kickoff_decisions).toEqual([
      expect.objectContaining({
        action: 'confirmed',
        decided_by: 'human',
        story_id: 'US-001',
      }),
    ]);
    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
        ),
        'utf8',
      ),
    ).toContain('**从而**让协作者依据同一业务模型开展讨论');
  });

  it('records revision feedback and accepts a replacement candidate', () => {
    const cwd = workspace();
    prepareKickoff(cwd);
    proposeKickoffCandidate(cwd, candidate());

    const revised = decideKickoff(
      cwd,
      'revise',
      '价值需要表达协作结果，而不是发布动作。',
    );
    expect(revised.kickoff_candidate).toBeUndefined();
    expect(revised.loop).toBe('kickoff');

    const replacement = proposeKickoffCandidate(
      cwd,
      candidate({ value: '减少协作者对模型版本的误解' }),
    );
    expect(replacement.kickoff_candidate?.artifact_path).toContain(
      'CAND-002.json',
    );
    expect(readState(cwd).kickoff_decisions?.[0]?.action).toBe('revise');
  });

  it.each(['split', 'deferred', 'stopped'] as const)(
    'halts the iteration when the human chooses %s',
    (action) => {
      const cwd = workspace();
      prepareKickoff(cwd);
      proposeKickoffCandidate(cwd, candidate());

      const state = decideKickoff(cwd, action, '本轮不应继续。');

      expect(state.halted?.reason).toContain(action);
      expect(state.kickoff_decisions?.at(-1)).toEqual(
        expect.objectContaining({ action, decided_by: 'human' }),
      );
    },
  );

  it('rejects an invalid or authority-free candidate', () => {
    const cwd = workspace();
    prepareKickoff(cwd);

    expect(() =>
      proposeKickoffCandidate(cwd, candidate({ sourceRefs: [] })),
    ).toThrow('sourceRefs must be a non-empty unique list');
    expect(() =>
      proposeKickoffCandidate(cwd, candidate({ role: '  ' })),
    ).toThrow('role must not be empty');
  });
});
