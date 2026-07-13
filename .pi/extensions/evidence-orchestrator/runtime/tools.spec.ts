import { describe, expect, it } from 'vitest';
import { registerTools } from './tools';

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
});
