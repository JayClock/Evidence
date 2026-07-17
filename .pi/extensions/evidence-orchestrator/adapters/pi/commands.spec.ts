import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureInboxSource } from '../../capabilities/inbox/repository';
import { proposeInboxStoryCandidates } from '../../capabilities/inbox/story-candidate';
import { DEFAULT_STATE } from '../../iteration/default-state';
import {
  readPersistedState,
  writeState,
} from '../../iteration/state-repository';
import { proposeKickoffCandidate } from '../../loops/kickoff/story-candidate';
import {
  cleanupWorkspaces,
  testIntakeSnapshot,
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
  parseDeskCheckDecision,
  parseKickoffDecision,
  parseModelingProfileDecision,
  parsePairDecision,
  parseScenarioDecision,
  promptDeskCheckDecision,
  promptKickoffDecision,
  promptModelDecision,
  promptModelingProfileDecision,
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
    intake_snapshot: testIntakeSnapshot(),
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
      'evidence-explain-diff',
      'evidence-showcase',
      'evidence-respond',
      'evidence-run',
    ]);
  });

  it('starts a new iteration from an explicit ready Inbox candidate', async () => {
    const cwd = workspace();
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
    let start:
      | ((args: string, ctx: ReturnType<typeof context>) => Promise<void>)
      | undefined;
    registerCommands({
      registerCommand(name: string, options: { handler: typeof start }): void {
        if (name === 'evidence-new') start = options.handler;
      },
    } as never);
    const ctx = context(cwd);

    await start?.('CAND-0001', ctx);

    expect(readPersistedState(cwd)).toMatchObject({
      intake_snapshot: { candidate_id: 'CAND-0001' },
      kickoff_candidate: { title: 'Retain deletion evidence' },
    });
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('run /evidence-kickoff'),
      'info',
    );
  });

  it('reuses source extraction and candidate selectors for evidence-new', async () => {
    const cwd = workspace();
    const source = captureInboxSource(cwd, {
      source_kind: 'manual_text',
      external_key: 'manual:interview',
      title: 'Interview',
      body: 'The owner needs an audit trail.',
    });
    const runAgent = vi.fn(async () => {
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
      return {
        agent: 'inbox-analyst',
        model: 'test/model',
        thinking: 'high' as const,
        output: 'Recorded CAND-0001.',
        messages: [],
        exitCode: 0,
        stderr: '',
      };
    });
    let start:
      | ((args: string, ctx: ReturnType<typeof context>) => Promise<void>)
      | undefined;
    registerCommands(
      {
        registerCommand(
          name: string,
          options: { handler: typeof start },
        ): void {
          if (name === 'evidence-new') start = options.handler;
        },
      } as never,
      runAgent as never,
    );
    const ctx = context(cwd);
    ctx.ui.select
      .mockResolvedValueOnce('INBOX-0001 · Interview')
      .mockResolvedValueOnce(
        'CAND-0001 · Retain deletion evidence · workspace owner',
      );

    await start?.('', ctx);

    expect(ctx.ui.select).toHaveBeenNthCalledWith(
      1,
      'Select one Inbox source to extract',
      ['INBOX-0001 · Interview'],
    );
    expect(ctx.ui.select).toHaveBeenNthCalledWith(
      2,
      'Select an Inbox Story candidate for the new iteration',
      ['CAND-0001 · Retain deletion evidence · workspace owner'],
    );
    expect(readPersistedState(cwd)?.intake_snapshot?.candidate_id).toBe(
      'CAND-0001',
    );
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
    expect(parseKickoffDecision('confirm')).toEqual({ action: 'confirmed' });
    expect(parseScenarioDecision('confirm DRAFT-001,DRAFT-002')).toEqual({
      action: 'confirmed',
      draftIds: ['DRAFT-001', 'DRAFT-002'],
    });
    expect(parseModelDecision('confirm')).toEqual({ action: 'confirm' });
    expect(parseDeskCheckDecision('approve')).toEqual({ action: 'approve' });
    expect(parseDeskCheckDecision('approve Optional approval note.')).toEqual({
      action: 'approve',
      reason: 'Optional approval note.',
    });
    expect(
      parsePairDecision('approve Complete Story coding evidence.'),
    ).toEqual({
      kind: 'delivery',
      action: 'showcase',
      reason: 'Complete Story coding evidence.',
    });
    expect(() =>
      parsePairDecision('accept-red Human should not classify routine Red.'),
    ).toThrow('Usage: /evidence-pair approve');
    expect(() => parseDeskCheckDecision('revise')).toThrow('requires a reason');
    expect(() => parseKickoffDecision('revise')).toThrow(
      'requires a business reason',
    );
    expect(() => parseScenarioDecision('continue')).toThrow(
      'requires a reason',
    );
    expect(() => parseModelDecision('revise')).toThrow('requires a reason');
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

  it('approves Desk Check interactively without asking for a reason', async () => {
    const cwd = workspace();
    writeState(cwd, {
      ...issueState(),
      loop: 'tasking',
      tasking_stage: 'desk_check',
      tasking_candidate: {
        version: 2,
        draft_id: 'DRAFT-001',
        story_id: 'US-001',
        scenario_ids: ['SC-001'],
        tests: [
          {
            id: 'TEST-001',
            quadrant: 'Q2',
            intent: 'The confirmed outcome is visible.',
            runtime_plan_id: 'RUNTIME-001',
            process_id: 'typescript-web',
            step_id: 'feature-q2',
            supported_by: [],
            scenario_ids: ['SC-001'],
            business_data: ['workspace=alpha'],
            model_refs: { entities: [], associations: [] },
          },
        ],
        tasks: [
          {
            id: 'TASK-001',
            description: 'Implement the confirmed outcome.',
            test_ids: ['TEST-001'],
            depends_on: [],
            model_refs: { entities: [], associations: [] },
          },
        ],
        processes: [
          {
            id: 'typescript-web',
            path: 'engineering/evidence-orchestrator/test-processes/web.json',
            runtime: 'typescript',
            functional_contexts: ['workspace'],
            technical_boundaries: ['react-feature'],
            process_version: 3,
            definition_sha256: 'a'.repeat(64),
            selected_step_ids: ['feature-q2'],
            project_ids: [],
            command_variables_by_test: {
              'TEST-001': { test_filter: 'confirmed_outcome' },
            },
            focused_commands: [
              {
                test_id: 'TEST-001',
                step_id: 'feature-q2',
                command: 'node focused.js confirmed_outcome',
              },
            ],
            quality_gate_commands: [{ command: 'node quality.js' }],
            materialized_sha256: 'b'.repeat(64),
          },
        ],
        test_list_path: 'artifacts/04-planning/test-list.md',
        task_list_path: 'artifacts/04-planning/task-list.md',
        candidate_path: 'artifacts/04-planning/tasking-candidate.json',
        test_list_sha256: 'test-list-sha',
        task_list_sha256: 'task-list-sha',
        candidate_sha256: 'candidate-sha',
        proposed_at: '2026-01-01T00:00:00.000Z',
      },
    });
    const ctx = context(cwd);
    ctx.ui.select.mockResolvedValue('批准并进入 Pair');

    await expect(promptDeskCheckDecision(ctx as never)).resolves.toEqual({
      action: 'approve',
    });
    expect(ctx.ui.input).not.toHaveBeenCalled();
  });

  it('lets the human reselect a Profile and fixes none to no model change', async () => {
    const cwd = workspace();
    writeState(cwd, {
      ...issueState(),
      loop: 'understand',
      understand_stage: 'modeling',
      modeling_stage: 'profile_review',
      modeling_profile_proposal: {
        version: 1,
        subject: 'tool',
        method: 'none',
        model_change_required: false,
        reason: 'The AI sees no canonical semantics.',
        proposed_at: '2026-01-01T00:00:00.000Z',
      },
    });
    const ctx = context(cwd);
    ctx.ui.select
      .mockResolvedValueOnce('逐项审核建模对象、方法与模型变化')
      .mockResolvedValueOnce('tool')
      .mockResolvedValueOnce('none');
    ctx.ui.input.mockResolvedValue('The human confirms no model impact.');

    await expect(promptModelingProfileDecision(ctx as never)).resolves.toEqual({
      subject: 'tool',
      method: 'none',
      modelChangeRequired: false,
      reason: 'The human confirms no model impact.',
    });
    expect(ctx.ui.select).toHaveBeenNthCalledWith(
      1,
      '建模建议：tool/none · change=false',
      ['逐项审核建模对象、方法与模型变化', '明确接受 AI 建议'],
    );
    expect(ctx.ui.select).toHaveBeenCalledTimes(3);
    expect(ctx.ui.select).not.toHaveBeenCalledWith(
      '权威模型是否需要变化',
      expect.anything(),
    );
  });

  it.each([
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

  it('accepts an empty optional Kickoff confirmation reason', async () => {
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
    ctx.ui.editor.mockResolvedValue('');

    await expect(promptKickoffDecision(ctx as never)).resolves.toEqual({
      action: 'confirmed',
    });
    expect(ctx.ui.editor).toHaveBeenCalledWith(
      '请确认或修改“确认这张 Story”的业务理由',
      '',
    );
  });

  it('uses an edited Kickoff reason when supplied', async () => {
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

  it('does not prefill a reason for the complete Scenario Set', async () => {
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
    const selected = '确认完整 Scenario Set';
    ctx.ui.select.mockResolvedValue(selected);
    ctx.ui.editor.mockResolvedValue('');

    await expect(promptScenarioDecision(ctx as never)).resolves.toEqual({
      action: 'confirmed',
      draftIds: ['DRAFT-001'],
    });
    expect(ctx.ui.editor).toHaveBeenCalledWith(
      `请确认或修改“${selected}”的业务理由`,
      '',
    );
  });

  it('accepts empty optional Scenario and model confirmation reasons', async () => {
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
    const scenarioCtx = context(cwd);
    scenarioCtx.ui.select.mockResolvedValue('确认完整 Scenario Set');
    scenarioCtx.ui.editor.mockResolvedValue('');

    await expect(promptScenarioDecision(scenarioCtx as never)).resolves.toEqual(
      {
        action: 'confirmed',
        draftIds: ['DRAFT-001'],
      },
    );

    writeState(cwd, {
      ...issueState(),
      loop: 'understand',
      understand_stage: 'modeling',
      modeling_stage: 'model_review',
      modeling_profile: {
        version: 1,
        subject: 'domain',
        method: 'object',
        model_change_required: false,
        reason: 'The existing model is sufficient.',
        confirmed_by: 'human',
        confirmed_at: '2026-01-01T00:00:00.000Z',
      },
      model_expansion_path: 'expansion.json',
      model_git_baseline: 'baseline',
      model_challenges: [
        {
          version: 1,
          requested_outcome: 'pass',
          outcome: 'pass',
          summary: 'The projection passed.',
          checked_regression_ids: [],
          projection_sha256: 'hash',
          artifact_path: 'challenge.json',
          challenged_by: 'model-challenger',
          challenged_at: '2026-01-01T00:01:00.000Z',
        },
      ],
    });
    const modelCtx = context(cwd);
    modelCtx.ui.select.mockResolvedValue('确认模型与统一语言');
    modelCtx.ui.input.mockResolvedValue('');

    await expect(promptModelDecision(modelCtx as never)).resolves.toEqual({
      action: 'confirm',
    });
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
    ctx.ui.select.mockResolvedValue('确认完整 Scenario Set');
    ctx.ui.editor.mockResolvedValue('该场景集合覆盖本轮完整可交付业务结果。');

    await expect(promptScenarioDecision(ctx as never)).resolves.toEqual({
      action: 'confirmed',
      draftIds: ['DRAFT-001'],
      reason: '该场景集合覆盖本轮完整可交付业务结果。',
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
