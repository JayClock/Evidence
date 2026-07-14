import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, PHASE_META } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  workspace,
  write,
  writeIterationArtifact,
} from '../tests/support';
import { registerTools } from './tools';

const phaseRunnerMocks = vi.hoisted(() => ({
  runPhaseSubagent: vi.fn(),
}));

vi.mock('../subagents/phase-runner', () => ({
  runPhaseSubagent: phaseRunnerMocks.runPhaseSubagent,
}));

beforeEach(() => {
  phaseRunnerMocks.runPhaseSubagent.mockImplementation(
    async (options: {
      onUpdate?: (progress: Record<string, unknown>) => void;
    }) => {
      options.onUpdate?.({
        agent: 'requirements-analyst',
        model: 'openai/test',
        thinking: 'medium',
        output: 'Clarification is running.',
        messages: [],
        exitCode: -1,
        stderr: '',
      });
      return {
        agent: 'requirements-analyst',
        model: 'openai/test',
        thinking: 'medium',
        output: 'Clarification paused for a domain answer.',
        messages: [],
        exitCode: 0,
        stderr: '',
      };
    },
  );
});

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
});

function clarifyState() {
  return {
    ...DEFAULT_STATE,
    phase: 'clarify' as const,
    requirement_source: {
      type: 'github_issue' as const,
      repository: 'owner/repo',
      issue_number: 1,
      url: 'https://example.test/issues/1',
      snapshot_path: 'artifacts/iterations/ITER-0001/00-user-input/issue.json',
      projection_path:
        'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      content_hash: 'sha256:test',
      issue_updated_at: '2026-01-01T00:00:00.000Z',
      fetched_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

function writeClarifyInputs(cwd: string): void {
  for (const path of PHASE_META.clarify.inputs) {
    write(
      cwd,
      path.startsWith('artifacts/')
        ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
        : path,
      'input',
    );
  }
}

describe('tools', () => {
  it('registers phase-subagent, TQA, work-item, and test-process selection tools', () => {
    const tools: Array<{
      name: string;
      renderCall?: unknown;
      renderResult?: unknown;
    }> = [];
    let toolResultHandler:
      | ((event: { toolName: string; details: unknown }) => unknown)
      | undefined;
    registerTools({
      registerTool(definition: {
        name: string;
        renderCall?: unknown;
        renderResult?: unknown;
      }) {
        tools.push(definition);
      },
      on(event: string, handler: unknown) {
        if (event === 'tool_result') {
          toolResultHandler = handler as typeof toolResultHandler;
        }
      },
    } as never);

    expect(tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'evidence_orchestrator_run_phase',
        'evidence_orchestrator_start_from_issue',
        'evidence_orchestrator_sync_issue',
        'evidence_orchestrator_propose_kickoff',
        'evidence_orchestrator_propose_scenarios',
        'evidence_orchestrator_propose_modeling_profile',
        'evidence_orchestrator_record_model_analysis',
        'evidence_orchestrator_record_model_challenge',
        'evidence_orchestrator_ask_question',
        'evidence_orchestrator_answer_question',
        'evidence_orchestrator_select_story',
        'evidence_orchestrator_propose_story_outcome',
        'evidence_orchestrator_select_work_item',
        'evidence_orchestrator_select_test_process',
      ]),
    );
    expect(tools.map(({ name }) => name)).not.toContain(
      'evidence_orchestrator_complete_story',
    );
    const phaseRunner = tools.find(
      ({ name }) => name === 'evidence_orchestrator_run_phase',
    );
    const clarificationAnswer = tools.find(
      ({ name }) => name === 'evidence_orchestrator_answer_question',
    );
    expect(phaseRunner?.renderCall).toBeTypeOf('function');
    expect(phaseRunner?.renderResult).toBeTypeOf('function');
    expect(clarificationAnswer?.renderResult).toBeTypeOf('function');
    expect(
      toolResultHandler?.({
        toolName: 'evidence_orchestrator_run_phase',
        details: { exitCode: 1 },
      }),
    ).toEqual({ isError: true });
    expect(
      toolResultHandler?.({
        toolName: 'evidence_orchestrator_select_story',
        details: { exitCode: 1 },
      }),
    ).toEqual({ isError: true });
    expect(
      toolResultHandler?.({
        toolName: 'evidence_orchestrator_answer_question',
        details: { exitCode: 1 },
      }),
    ).toEqual({ isError: true });
    expect(
      toolResultHandler?.({
        toolName: 'evidence_orchestrator_run_phase',
        details: { exitCode: 0 },
      }),
    ).toBeUndefined();
  });

  it('lets the AI propose one Kickoff candidate without creating a Story', async () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'kickoff',
    });
    let execute:
      | ((
          toolCallId: string,
          params: {
            title: string;
            problem: string;
            role: string;
            goal: string;
            value: string;
            cognitiveMode: string;
            sourceRefs: string[];
          },
          signal: undefined,
          onUpdate: undefined,
          ctx: unknown,
        ) => Promise<unknown>)
      | undefined;
    registerTools({
      registerTool(definition: { name: string; execute?: typeof execute }) {
        if (definition.name === 'evidence_orchestrator_propose_kickoff') {
          execute = definition.execute;
        }
      },
      on() {
        return undefined;
      },
    } as never);

    const result = await execute?.(
      '',
      {
        title: '共享模型',
        problem: '协作者无法识别当前模型。',
        role: '领域建模负责人',
        goal: '确认当前有效模型',
        value: '让协作者依据同一模型讨论',
        cognitiveMode: 'complex',
        sourceRefs: ['docs/product/user-journeys.md#旅程-a'],
      },
      undefined,
      undefined,
      { cwd },
    );

    expect(readState(cwd).kickoff_candidate).toEqual(
      expect.objectContaining({ title: '共享模型' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        content: [
          expect.objectContaining({
            text: expect.stringContaining('/evidence-kickoff'),
          }),
        ],
      }),
    );
  });

  it('lets the AI propose concrete Scenarios without confirming one', async () => {
    const cwd = workspace();
    writeIterationArtifact(cwd, '01-requirements/stories/US-001.md', '# Story');
    writeState(cwd, {
      ...clarifyState(),
      workflow_version: 5,
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
    });
    let execute:
      | ((
          toolCallId: string,
          params: {
            storyId: string;
            candidates: Array<{
              title: string;
              given: string[];
              when: string;
              then: string[];
              businessData: string[];
            }>;
          },
          signal: undefined,
          onUpdate: undefined,
          ctx: unknown,
        ) => Promise<unknown>)
      | undefined;
    registerTools({
      registerTool(definition: { name: string; execute?: typeof execute }) {
        if (definition.name === 'evidence_orchestrator_propose_scenarios') {
          execute = definition.execute;
        }
      },
      on() {
        return undefined;
      },
    } as never);

    const result = await execute?.(
      '',
      {
        storyId: 'US-001',
        candidates: [
          {
            title: '确认当前模型',
            given: ['v3 已确认'],
            when: '负责人打开模型',
            then: ['显示 v3'],
            businessData: ['版本：v3'],
          },
        ],
      },
      undefined,
      undefined,
      { cwd },
    );

    expect(readState(cwd)).toMatchObject({
      understand_stage: 'scenario_review',
      scenario_drafts: [{ draft_id: 'DRAFT-001' }],
    });
    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        content: [
          expect.objectContaining({
            text: expect.stringContaining('/evidence-scenario'),
          }),
        ],
      }),
    );
  });

  it('lets the AI propose a modeling Profile without confirming it', async () => {
    const cwd = workspace();
    writeIterationArtifact(
      cwd,
      '01-requirements/examples/US-001-SC-001.md',
      '# Scenario',
    );
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'understand',
      phase: 'domain_model',
      understand_stage: 'modeling',
      modeling_stage: 'profile',
      confirmed_scenario: {
        version: 1,
        story_id: 'US-001',
        scenario_id: 'SC-001',
        source_draft_id: 'DRAFT-001',
        title: '确认当前模型',
        given: ['v3 已确认'],
        when: '负责人打开模型',
        then: ['显示 v3'],
        business_data: ['版本：v3'],
        artifact_path:
          'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
        confirmed_by: 'human',
        confirmation_reason: '最小价值。',
        confirmed_at: '2026-01-01T00:00:00.000Z',
      },
    });
    let execute:
      | ((
          toolCallId: string,
          params: {
            subject: string;
            method: string;
            modelChangeRequired: string;
            reason: string;
          },
          signal: undefined,
          onUpdate: undefined,
          ctx: unknown,
        ) => Promise<unknown>)
      | undefined;
    registerTools({
      registerTool(definition: { name: string; execute?: typeof execute }) {
        if (
          definition.name === 'evidence_orchestrator_propose_modeling_profile'
        ) {
          execute = definition.execute;
        }
      },
      on() {
        return undefined;
      },
    } as never);

    const result = await execute?.(
      '',
      {
        subject: 'domain',
        method: 'object',
        modelChangeRequired: 'false',
        reason: 'The existing object model may explain the Scenario.',
      },
      undefined,
      undefined,
      { cwd },
    );

    expect(readState(cwd)).toMatchObject({
      modeling_stage: 'profile_review',
      modeling_profile_proposal: {
        subject: 'domain',
        method: 'object',
        model_change_required: false,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        content: [
          expect.objectContaining({
            text: expect.stringContaining('/evidence-modeling-profile'),
          }),
        ],
      }),
    );
  });

  it('lets the AI propose an outcome without releasing the story', async () => {
    const cwd = workspace();
    writeClarifyInputs(cwd);
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      '# 编辑工作区信息\n',
    );
    writeState(cwd, {
      ...clarifyState(),
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
    });
    let execute:
      | ((
          toolCallId: string,
          params: { storyId: string; outcome: string; summary: string },
          signal: undefined,
          onUpdate: undefined,
          ctx: unknown,
        ) => Promise<unknown>)
      | undefined;
    registerTools({
      registerTool(definition: { name: string; execute?: typeof execute }) {
        if (definition.name === 'evidence_orchestrator_propose_story_outcome') {
          execute = definition.execute;
        }
      },
      on() {
        return undefined;
      },
    } as never);

    const result = await execute?.(
      '',
      {
        storyId: 'US-001',
        outcome: 'clarified',
        summary: '业务边界已经明确。',
      },
      undefined,
      undefined,
      { cwd },
    );

    const state = readState(cwd);
    expect(state.active_clarification_story?.story_id).toBe('US-001');
    expect(state.clarification_story_outcomes).toBeUndefined();
    expect(state.proposed_clarification_story_outcome).toEqual(
      expect.objectContaining({ outcome: 'clarified' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        content: [
          expect.objectContaining({
            text: expect.stringContaining('/evidence-story-complete'),
          }),
        ],
      }),
    );
  });

  it('records an answer and resumes the clarification dialogue in the same tool call', async () => {
    const cwd = workspace();
    writeClarifyInputs(cwd);
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      '# 编辑工作区信息\n',
    );
    writeIterationArtifact(cwd, '01-requirements/clarifications/.gitkeep', '');
    writeState(cwd, {
      ...clarifyState(),
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        question: '谁可以编辑工作区信息？',
        target: 'history',
        asked_at: '2026-01-01T00:01:00.000Z',
      },
    });
    let execute:
      | ((
          toolCallId: string,
          params: { answer: string },
          signal: undefined,
          onUpdate: (result: unknown) => void,
          ctx: unknown,
        ) => Promise<unknown>)
      | undefined;
    registerTools({
      registerTool(definition: { name: string; execute?: typeof execute }) {
        if (definition.name === 'evidence_orchestrator_answer_question') {
          execute = definition.execute;
        }
      },
      on() {
        return undefined;
      },
    } as never);
    const onUpdate = vi.fn();

    const result = await execute?.(
      '',
      { answer: '工作区所有者。' },
      undefined,
      onUpdate,
      { cwd, ui: { setStatus: vi.fn() } },
    );

    expect(readState(cwd).pending_clarification).toBeUndefined();
    expect(readState(cwd).clarification_history).toEqual([
      expect.objectContaining({
        question_id: 'Q-001',
        answer: '工作区所有者。',
      }),
    ]);
    expect(phaseRunnerMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'clarify' }),
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ status: 'running' }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        content: [
          expect.objectContaining({
            text: expect.stringContaining(
              'Clarification paused for a domain answer.',
            ),
          }),
        ],
        details: expect.objectContaining({
          status: 'completed',
          exitCode: 0,
        }),
      }),
    );
  });

  it('selects a story and runs its clarification in the same tool call', async () => {
    const cwd = workspace();
    writeClarifyInputs(cwd);
    writeState(cwd, clarifyState());
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      '# 编辑工作区信息\n',
    );
    let execute:
      | ((
          toolCallId: string,
          params: unknown,
          signal: undefined,
          onUpdate: (result: unknown) => void,
          ctx: unknown,
        ) => Promise<unknown>)
      | undefined;
    const sendUserMessage = vi.fn();
    registerTools({
      registerTool(definition: { name: string; execute?: typeof execute }) {
        if (definition.name === 'evidence_orchestrator_select_story') {
          execute = definition.execute;
        }
      },
      on() {
        return undefined;
      },
      sendUserMessage,
    } as never);
    const select = vi.fn().mockResolvedValue('US-001 · 编辑工作区信息');
    const onUpdate = vi.fn();

    const result = await execute?.('', {}, undefined, onUpdate, {
      cwd,
      hasUI: true,
      ui: { select, setStatus: vi.fn() },
    });

    expect(select).toHaveBeenCalledWith('选择一张用户故事卡进行澄清', [
      'US-001 · 编辑工作区信息',
    ]);
    expect(readState(cwd).active_clarification_story?.story_id).toBe('US-001');
    expect(phaseRunnerMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'clarify' }),
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ status: 'running' }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        details: expect.objectContaining({
          status: 'completed',
          exitCode: 0,
        }),
      }),
    );
    expect(sendUserMessage).not.toHaveBeenCalled();
  });
});
