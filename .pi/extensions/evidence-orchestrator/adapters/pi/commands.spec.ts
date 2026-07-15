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
  parseModelDecision,
  parseRespondDecision,
  parseShowcaseDecision,
  registerCommands,
} from './commands';
import { promptKickoffDecision } from './command-inputs';

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
  it('registers only native loop and human-decision commands', () => {
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

  it('parses model, Showcase, and Respond human decisions', () => {
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
