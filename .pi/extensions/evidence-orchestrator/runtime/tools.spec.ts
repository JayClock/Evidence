import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../tests/support';
import { registerTools } from './tools';

afterEach(cleanupWorkspaces);

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
        'evidence_orchestrator_ask_question',
        'evidence_orchestrator_answer_question',
        'evidence_orchestrator_select_story',
        'evidence_orchestrator_complete_story',
        'evidence_orchestrator_select_work_item',
        'evidence_orchestrator_select_test_process',
      ]),
    );
    const phaseRunner = tools.find(
      ({ name }) => name === 'evidence_orchestrator_run_phase',
    );
    expect(phaseRunner?.renderCall).toBeTypeOf('function');
    expect(phaseRunner?.renderResult).toBeTypeOf('function');
    expect(
      toolResultHandler?.({
        toolName: 'evidence_orchestrator_run_phase',
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

  it('lets the user choose the clarification story through the picker', async () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'clarify' });
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
          onUpdate: undefined,
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

    await execute?.('', {}, undefined, undefined, {
      cwd,
      hasUI: true,
      isIdle: () => false,
      ui: { select },
    });

    expect(select).toHaveBeenCalledWith('选择一张用户故事卡进行澄清', [
      'US-001 · 编辑工作区信息',
    ]);
    expect(readState(cwd).active_clarification_story?.story_id).toBe('US-001');
    expect(sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining('evidence_orchestrator_run_phase'),
      { deliverAs: 'followUp' },
    );
  });
});
