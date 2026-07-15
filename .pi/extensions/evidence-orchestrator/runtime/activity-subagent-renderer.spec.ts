import { describe, expect, it } from 'vitest';
import {
  renderActivitySubagentCall,
  renderActivitySubagentResult,
  type ActivitySubagentToolDetails,
} from './activity-subagent-renderer';

const theme = {
  fg(_color: string, text: string): string {
    return text;
  },
  bold(text: string): string {
    return text;
  },
};

function details(
  overrides: Partial<ActivitySubagentToolDetails> = {},
): ActivitySubagentToolDetails {
  return {
    activity: 'pair',
    task: 'Implement US-001 / SC-001 using observed TDD.',
    status: 'running',
    agent: 'coder',
    model: 'openai-codex/gpt-test',
    thinking: 'medium',
    output: 'The Green step now passes.',
    messages: [
      {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'bash',
            arguments: { command: 'pnpm orchestrator:test' },
          },
        ],
      } as never,
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'The Green step now passes.' }],
      } as never,
    ],
    exitCode: -1,
    stderr: '',
    ...overrides,
  };
}

describe('activity subagent renderer', () => {
  it('shows child tool calls and latest text while the child is running', () => {
    const component = renderActivitySubagentResult(
      { content: [{ type: 'text', text: '(running...)' }], details: details() },
      { expanded: false, isPartial: true },
      theme,
    );

    const output = component.render(120).join('\n');

    expect(output).toContain('⏳ pair · coder');
    expect(output).toContain('$ pnpm orchestrator:test');
    expect(output).toContain('The Green step now passes.');
  });

  it('renders a pending TQA question as the visible dialogue turn', () => {
    const component = renderActivitySubagentResult(
      {
        content: [{ type: 'text', text: 'TQA Q-001 · US-001' }],
        details: details({
          activity: 'understand',
          task: 'Clarify US-001.',
          status: 'completed',
          agent: 'requirements-analyst',
          output:
            'TQA Q-001 · US-001\n\n谁可以编辑工作区信息？\n\n请直接回复此问题。',
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'toolCall',
                  id: 'call-1',
                  name: 'evidence_orchestrator_ask_question',
                  arguments: { question: '谁可以编辑工作区信息？' },
                },
              ],
            } as never,
          ],
          exitCode: 0,
        }),
      },
      { expanded: false, isPartial: false },
      theme,
    );

    const output = component.render(120).join('\n');

    expect(output).toContain('TQA Q-001 · US-001');
    expect(output).toContain('谁可以编辑工作区信息？');
    expect(output).toContain('请直接回复此问题。');
    expect(output).not.toContain('evidence_orchestrator_ask_question');
  });

  it('marks a completed child with a non-zero exit code as failed', () => {
    const component = renderActivitySubagentResult(
      {
        content: [{ type: 'text', text: 'child failed' }],
        details: details({ status: 'failed', exitCode: 1 }),
      },
      { expanded: false, isPartial: false },
      theme,
    );

    expect(component.render(120).join('\n')).toContain('✗ pair · coder');
  });

  it('expands the delegated task, final output, and stderr without adding them to tool content', () => {
    const component = renderActivitySubagentResult(
      {
        content: [{ type: 'text', text: 'The Green step now passes.' }],
        details: details({
          status: 'completed',
          exitCode: 0,
          stderr: 'warning from child',
        }),
      },
      { expanded: true, isPartial: false },
      theme,
    );

    const output = component.render(120).join('\n');

    expect(output).toContain('─── Delegated task ───');
    expect(output).toContain('Implement US-001 / SC-001');
    expect(output).toContain('─── Final child output ───');
    expect(output).toContain('warning from child');
  });

  it('renders a concise activity-subagent tool call header', () => {
    const output = renderActivitySubagentCall(
      { instructions: 'Prioritize the selected acceptance scenario.' },
      theme,
    )
      .render(120)
      .join('\n');

    expect(output).toContain('Evidence activity subagent');
    expect(output).toContain('Prioritize the selected acceptance scenario.');
  });
});
