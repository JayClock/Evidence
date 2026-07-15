import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../../iteration/default-state';
import { readState, writeState } from '../../../iteration/state-repository';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../../../tests/support';
import { askClarification } from '../tqa/conversation';
import { decideUnderstanding, proposeScenarioDrafts } from './candidates';

function prepareUnderstand(cwd: string): void {
  writeIterationArtifact(
    cwd,
    '01-requirements/stories/US-001.md',
    '# US-001 共享模型\n\n> **作为**建模负责人，\n> **我希望**共享模型，\n> **从而**协作。\n\n- [problem-statement.md](../problem-statement.md)\n',
  );
  writeState(cwd, {
    ...DEFAULT_STATE,
    workflow_version: 5,
    loop: 'understand',
    understand_stage: 'tqa',
    active_clarification_story: {
      story_id: 'US-001',
      selected_at: '2026-01-01T00:00:00.000Z',
    },
  });
}

function candidates() {
  return [
    {
      title: '确认当前共享模型',
      given: ['工作区存在模型版本 v2 和 v3', 'v3 已由工作区 Owner 确认'],
      when: '领域建模负责人打开共享模型',
      then: ['系统呈现 v3 为当前模型', '协作者看到 v3 的确认状态'],
      businessData: ['工作区：采购域', '当前版本：v3', '确认者：Owner'],
    },
    {
      title: '没有已确认模型',
      given: ['工作区只有未经确认的模型版本 v1'],
      when: '领域建模负责人打开共享模型',
      then: ['系统明确显示当前没有已确认模型'],
      businessData: ['工作区：采购域', '候选版本：v1'],
    },
  ];
}

afterEach(cleanupWorkspaces);

describe('v5 concrete Scenario understanding', () => {
  it('persists concrete drafts and waits for a human decision', () => {
    const cwd = workspace();
    prepareUnderstand(cwd);

    const state = proposeScenarioDrafts(
      cwd,
      'US-001',
      candidates(),
      '2026-01-01T00:01:00.000Z',
    );

    expect(state.understand_stage).toBe('scenario_review');
    expect(state.scenario_drafts).toHaveLength(2);
    expect(state.scenario_drafts?.[0]).toMatchObject({
      draft_id: 'DRAFT-001',
      story_id: 'US-001',
      business_data: expect.arrayContaining(['当前版本：v3']),
    });
    expect(
      existsSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
        ),
      ),
    ).toBe(false);
  });

  it('lets a human confirm one draft as the only active Scenario', () => {
    const cwd = workspace();
    prepareUnderstand(cwd);
    proposeScenarioDrafts(cwd, 'US-001', candidates());

    const state = decideUnderstanding(
      cwd,
      {
        action: 'confirmed',
        draftId: 'DRAFT-001',
        reason: '这是可独立验证的最小用户价值。',
      },
      '2026-01-01T00:02:00.000Z',
    );

    expect(state).toMatchObject({
      loop: 'understand',
      understand_stage: 'modeling',
      confirmed_scenario: {
        story_id: 'US-001',
        scenario_id: 'SC-001',
        source_draft_id: 'DRAFT-001',
        confirmed_by: 'human',
      },
    });
    expect(state.active_clarification_story).toBeUndefined();
    const markdown = readFileSync(
      join(
        cwd,
        'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
      ),
      'utf8',
    );
    expect(markdown).toContain('## Given');
    expect(markdown).toContain('## When');
    expect(markdown).toContain('## Then');
    expect(markdown).toContain('"confirmed_by": "human"');
  });

  it('returns to TQA when the human rejects the drafts', () => {
    const cwd = workspace();
    prepareUnderstand(cwd);
    proposeScenarioDrafts(cwd, 'US-001', candidates());

    const state = decideUnderstanding(cwd, {
      action: 'continue',
      reason: '还需要明确没有确认版本时谁负责处理。',
    });

    expect(state.understand_stage).toBe('tqa');
    expect(state.scenario_drafts).toBeUndefined();
    expect(state.active_clarification_story?.story_id).toBe('US-001');
  });

  it.each(['split', 'deferred'] as const)(
    'lets the human directly choose %s and waives a pending question',
    (action) => {
      const cwd = workspace();
      prepareUnderstand(cwd);
      askClarification(cwd, {
        story_id: 'US-001',
        question: '谁处理没有确认版本的情况？',
        target: 'history',
      });

      const state = decideUnderstanding(cwd, {
        action,
        reason: '该问题暂时不适合继续。',
      });

      expect(state.halted?.reason).toContain(action);
      expect(state.pending_clarification).toBeUndefined();
      expect(state.clarification_history?.at(-1)).toEqual(
        expect.objectContaining({ waived_by: 'human' }),
      );
    },
  );

  it('rejects an unknown draft and a proposal while TQA is pending', () => {
    const cwd = workspace();
    prepareUnderstand(cwd);
    askClarification(cwd, {
      story_id: 'US-001',
      question: '谁确认当前模型？',
      target: 'history',
    });
    expect(() => proposeScenarioDrafts(cwd, 'US-001', candidates())).toThrow(
      'must be answered',
    );

    writeState(cwd, {
      ...readState(cwd),
      pending_clarification: undefined,
    });
    proposeScenarioDrafts(cwd, 'US-001', candidates());
    expect(() =>
      decideUnderstanding(cwd, {
        action: 'confirmed',
        draftId: 'DRAFT-999',
        reason: '选择最小场景。',
      }),
    ).toThrow('Unknown Scenario draft DRAFT-999');
  });
});
