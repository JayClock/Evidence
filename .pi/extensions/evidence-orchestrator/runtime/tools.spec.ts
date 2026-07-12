import { describe, expect, it } from 'vitest';
import { registerTools } from './tools';

describe('tools', () => {
  it('registers phase-subagent, TQA, work-item, and test-process selection tools', () => {
    const tools: string[] = [];
    registerTools({
      registerTool(definition: { name: string }) {
        tools.push(definition.name);
      },
    } as never);

    expect(tools).toEqual(
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
  });
});
