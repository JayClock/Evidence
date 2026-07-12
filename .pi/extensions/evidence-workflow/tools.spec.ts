import { describe, expect, it } from 'vitest';
import { registerTools } from './tools';

describe('tools', () => {
  it('registers TQA, work-item, and test-process selection tools', () => {
    const tools: string[] = [];
    registerTools({
      registerTool(definition: { name: string }) {
        tools.push(definition.name);
      },
    } as never);

    expect(tools).toEqual(
      expect.arrayContaining([
        'evidence_workflow_ask_question',
        'evidence_workflow_answer_question',
        'evidence_workflow_select_work_item',
        'evidence_workflow_select_test_process',
      ]),
    );
  });
});
