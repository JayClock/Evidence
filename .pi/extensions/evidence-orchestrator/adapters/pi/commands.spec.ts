import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { writeState } from '../../iteration/state-repository';
import { proposeKickoffCandidate } from '../../loops/kickoff/story-candidate';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import {
  activeStageCommand,
  parseModelDecision,
  parseRespondDecision,
  parseShowcaseDecision,
  registerCommands,
} from './commands';
import {
  parseModelingProfileDecision,
  promptKickoffDecision,
  promptScenarioDecision,
} from './command-inputs';

function context(cwd: string) {
  return {
    cwd,
    mode: 'rpc',
    hasUI: true,
    isIdle: () => true,
    waitForIdle: vi.fn(),
    ui: {
      notify: vi.fn(),
      select: vi.fn(),
      input: vi.fn(),
      editor: vi.fn(),
      setStatus: vi.fn(),
      setWidget: vi.fn(),
    },
  };
}

function issueState() {
  return {
    ...DEFAULT_STATE,
    requirement_source: {
      type: 'github_issue' as const,
      repository: 'owner/repo',
      issue_number: 42,
      url: 'https://example.test/issues/42',
      snapshot_path: 'artifacts/iterations/ITER-0001/00-user-input/issue.json',
      projection_path:
        'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      content_hash: 'hash',
      issue_updated_at: '2026-01-01T00:00:00.000Z',
      fetched_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

afterEach(cleanupWorkspaces);

describe('commands', () => {
  it('registers explicit activity and stage-owned human-decision commands', () => {
    const commands: string[] = [];
    registerCommands({
      registerCommand(name: string) {
        commands.push(name);
      },
    } as never);

    expect(commands).toEqual([
      'evidence-status',
      'evidence-new',
      'evidence-kickoff',
      'evidence-scenario',
      'evidence-modeling-profile',
      'evidence-model',
      'evidence-desk-check',
      'evidence-pair',
      'evidence-showcase',
      'evidence-respond',
      'evidence-issue-sync',
      'evidence-issue-status',
      'evidence-run',
    ]);
  });

  it('selects only the command owned by the current stage', () => {
    expect(activeStageCommand('/unused', issueState())).toBe('evidence-run');
    expect(
      activeStageCommand('/unused', {
        ...issueState(),
        kickoff_candidate: {
          version: 1,
          title: 'Candidate',
          problem: 'Problem',
          role: 'Owner',
          goal: 'Goal',
          value: 'Value',
          cognitive_mode: 'clear',
          source_refs: ['issue#42'],
          proposed_at: '2026-01-01T00:00:00.000Z',
          artifact_path: 'candidate.json',
        },
      }),
    ).toBe('evidence-kickoff');
    expect(
      activeStageCommand('/unused', {
        ...issueState(),
        loop: 'understand',
        understand_stage: 'scenario_review',
      }),
    ).toBe('evidence-scenario');
    expect(
      activeStageCommand('/unused', {
        ...issueState(),
        loop: 'tasking',
        tasking_stage: 'desk_check',
      }),
    ).toBe('evidence-desk-check');
    expect(
      activeStageCommand('/unused', { ...issueState(), loop: 'complete' }),
    ).toBeUndefined();
  });

  it('parses model, Showcase, and Respond human decisions', () => {
    expect(parseModelingProfileDecision('confirm')).toEqual({});
    expect(
      parseModelingProfileDecision('confirm 领域对象方法符合当前场景。'),
    ).toEqual({ reason: '领域对象方法符合当前场景。' });
    expect(
      parseModelDecision(
        'confirm The projection and ubiquitous language match the conversation.',
      ),
    ).toEqual({
      action: 'confirm',
      reason: 'The projection and ubiquitous language match the conversation.',
    });
    expect(
      parseShowcaseDecision(
        'risk q4 required performance,security Production risk.',
      ),
    ).toMatchObject({
      kind: 'risk',
      quadrant: 'Q4',
      disposition: 'required',
      activities: ['performance', 'security'],
    });
    expect(() =>
      parseShowcaseDecision('risk q3 required security Wrong quadrant.'),
    ).toThrow('Showcase Q3 activities');
    expect(
      parseShowcaseDecision(
        'observe manual://workspace-alpha Workspace Alpha is visible. :: The owner can continue.',
      ),
    ).toMatchObject({
      kind: 'observation',
      evidenceRefs: ['manual://workspace-alpha'],
    });
    expect(
      parseShowcaseDecision(
        'evaluate q4/security passed manual://security Only the owner has access.',
      ),
    ).toMatchObject({
      kind: 'evaluation',
      quadrant: 'Q4',
      activity: 'security',
      outcome: 'passed',
    });
    expect(
      parseShowcaseDecision('revise code Implementation quality is weak.'),
    ).toMatchObject({
      kind: 'decision',
      action: 'revise',
      target: 'implementation',
    });
    expect(parseRespondDecision('approve Evidence is sufficient.')).toEqual({
      action: 'approve',
      reason: 'Evidence is sufficient.',
    });
  });

  it.each([
    [
      '确认这张 Story',
      '候选“Confirm the workspace model”准确表达了本轮需要解决的业务问题、受益角色和预期价值。',
    ],
    [
      '要求修改候选',
      '候选“Confirm the workspace model”尚未准确表达本轮业务问题、受益角色或预期价值，需要修改。',
    ],
    [
      '先拆分问题',
      '候选“Confirm the workspace model”包含多个可独立验证的业务结果，需要先拆分。',
    ],
    [
      '延期本轮',
      '候选“Confirm the workspace model”当前不具备继续推进所需的业务条件，本轮延期。',
    ],
    [
      '停止本轮',
      '候选“Confirm the workspace model”不再属于本轮需要推进的业务问题，本轮停止。',
    ],
  ])('prefills an editable Kickoff reason for %s', async (selected, reason) => {
    const cwd = workspace();
    writeState(cwd, issueState());
    proposeKickoffCandidate(cwd, {
      title: 'Confirm the workspace model',
      problem: 'The current model is not visibly confirmed.',
      role: 'modeling lead',
      goal: 'see the confirmed model',
      value: 'continue with shared understanding',
      cognitiveMode: 'clear',
      sourceRefs: ['issue#42'],
    });
    const ctx = context(cwd);
    ctx.ui.select.mockResolvedValue(selected);
    ctx.ui.editor.mockResolvedValue(reason);

    const decision = await promptKickoffDecision(ctx as never);

    expect(ctx.ui.editor).toHaveBeenCalledWith(
      `请确认或修改“${selected}”的业务理由`,
      reason,
    );
    expect(decision?.reason).toBe(reason);
  });

  it('uses the edited Kickoff reason instead of the prefilled value', async () => {
    const cwd = workspace();
    writeState(cwd, issueState());
    proposeKickoffCandidate(cwd, {
      title: 'Confirm the workspace model',
      problem: 'The current model is not visibly confirmed.',
      role: 'modeling lead',
      goal: 'see the confirmed model',
      value: 'continue with shared understanding',
      cognitiveMode: 'clear',
      sourceRefs: ['issue#42'],
    });
    const ctx = context(cwd);
    ctx.ui.select.mockResolvedValue('确认这张 Story');
    ctx.ui.editor.mockResolvedValue('业务负责人已核对问题边界和预期价值。');

    await expect(promptKickoffDecision(ctx as never)).resolves.toEqual({
      action: 'confirmed',
      reason: '业务负责人已核对问题边界和预期价值。',
    });
  });

  it('prefills an editable reason for the selected minimal Scenario', async () => {
    const cwd = workspace();
    writeState(cwd, {
      ...issueState(),
      loop: 'understand',
      understand_stage: 'scenario_review',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      scenario_drafts: [
        {
          version: 1,
          draft_id: 'DRAFT-001',
          story_id: 'US-001',
          title: '领域建模负责人修改工作区名称和描述',
          given: ['负责人可进入工作区'],
          when: '负责人保存新的名称和描述',
          then: ['成员看到更新后的名称和描述'],
          business_data: ['工作区名称不重名'],
          proposed_at: '2026-01-01T00:01:00.000Z',
          artifact_path: 'draft.json',
        },
      ],
    });
    const ctx = context(cwd);
    const selected = '确认 DRAFT-001 · 领域建模负责人修改工作区名称和描述';
    const defaultReason =
      '“DRAFT-001 · 领域建模负责人修改工作区名称和描述”是本轮可独立验证并交付用户价值的最小业务 Scenario。';
    ctx.ui.select.mockResolvedValue(selected);
    ctx.ui.editor.mockResolvedValue(defaultReason);

    await expect(promptScenarioDecision(ctx as never)).resolves.toEqual({
      action: 'confirmed',
      draftId: 'DRAFT-001',
      reason: defaultReason,
    });
    expect(ctx.ui.editor).toHaveBeenCalledWith(
      `请确认或修改“${selected}”的业务理由`,
      defaultReason,
    );
  });

  it('uses an edited Scenario reason instead of its prefilled value', async () => {
    const cwd = workspace();
    writeState(cwd, {
      ...issueState(),
      loop: 'understand',
      understand_stage: 'scenario_review',
      scenario_drafts: [
        {
          version: 1,
          draft_id: 'DRAFT-001',
          story_id: 'US-001',
          title: '修改工作区信息',
          given: ['负责人可进入工作区'],
          when: '负责人保存修改',
          then: ['修改生效'],
          business_data: ['工作区名称'],
          proposed_at: '2026-01-01T00:01:00.000Z',
          artifact_path: 'draft.json',
        },
      ],
    });
    const ctx = context(cwd);
    ctx.ui.select.mockResolvedValue('确认 DRAFT-001 · 修改工作区信息');
    ctx.ui.editor.mockResolvedValue('该场景覆盖本轮最小可交付业务结果。');

    await expect(promptScenarioDecision(ctx as never)).resolves.toEqual({
      action: 'confirmed',
      draftId: 'DRAFT-001',
      reason: '该场景覆盖本轮最小可交付业务结果。',
    });
  });

  it('previews the current activity without phase selector options', async () => {
    const cwd = workspace();
    for (const path of [
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      'docs/product/personas.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
    ]) {
      write(cwd, path, 'input');
    }
    writeState(cwd, issueState());
    let run:
      | ((args: string, ctx: ReturnType<typeof context>) => Promise<void>)
      | undefined;
    registerCommands({
      registerCommand(name: string, options: { handler: typeof run }) {
        if (name === 'evidence-run') run = options.handler;
      },
    } as never);
    const ctx = context(cwd);

    await run?.('--dry-run focus on the smallest value', ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Kickoff'),
      'info',
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.not.stringContaining('--phase'),
      'info',
    );
  });
});
