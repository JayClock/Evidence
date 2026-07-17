import { describe, expect, it } from 'vitest';
import {
  boundedModelVisibleActivityText,
  createActivityResultEntryData,
  MAX_ACTIVITY_ENTRY_BYTES,
  MAX_MODEL_VISIBLE_ACTIVITY_BYTES,
  renderActivityAgentCall,
  renderActivityAgentResult,
  renderActivityResultEntry,
  type ActivityAgentToolDetails,
} from './activity-agent-renderer';

const theme = {
  fg(_color: string, text: string): string {
    return text;
  },
  bold(text: string): string {
    return text;
  },
};

function details(
  overrides: Partial<ActivityAgentToolDetails> = {},
): ActivityAgentToolDetails {
  return {
    activity: 'pair',
    task: 'Implement US-001 / SC-001 using observed TDD.',
    status: 'running',
    agent: 'coder',
    model: 'openai-codex/gpt-test',
    requestedModel: 'openai-codex/gpt-test',
    actualModel: 'openai-codex/gpt-test',
    thinking: 'medium',
    sessionMode: 'ephemeral',
    toolNames: ['bash'],
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
    usage: {
      turns: 2,
      input_tokens: 12_400,
      output_tokens: 1_200,
      cache_read_tokens: 8_000,
      cache_write_tokens: 0,
      cost_usd: 0.043,
      context_tokens_at_end: 13_600,
    },
    stopReason: 'stop',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:18.200Z',
    durationMs: 18_200,
    toolCallCounts: { bash: 1 },
    ...overrides,
  };
}

describe('activity agent renderer', () => {
  it('shows child tool calls and latest text while the child is running', () => {
    const component = renderActivityAgentResult(
      { content: [{ type: 'text', text: '(running...)' }], details: details() },
      { expanded: false, isPartial: true },
      theme,
    );

    const output = component.render(120).join('\n');

    expect(output).toContain('⏳ pair · coder');
    expect(output).toContain('2 turns ↑12k ↓1.2k R8.0k $0.0430 · 18.2s');
    expect(output).toContain('$ pnpm orchestrator:test');
    expect(output).toContain('The Green step now passes.');
  });

  it('renders a pending TQA question as the visible dialogue turn', () => {
    const component = renderActivityAgentResult(
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

  it('shows actual model fallback and an explicitly unreported cost', () => {
    const component = renderActivityAgentResult(
      {
        content: [{ type: 'text', text: 'Done' }],
        details: details({
          status: 'completed',
          exitCode: 0,
          model: 'fallback-model',
          requestedModel: 'requested-model',
          actualModel: 'fallback-model',
          usage: {
            ...details().usage,
            cost_usd: null,
          },
        }),
      },
      { expanded: false, isPartial: false },
      theme,
    );

    const output = component.render(160).join('\n');
    expect(output).toContain('fallback-model (requested requested-model)');
    expect(output).toContain('cost:n/a');
    expect(output).not.toContain('$0');
  });

  it('marks a completed child with a non-zero exit code as failed', () => {
    const component = renderActivityAgentResult(
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
    const component = renderActivityAgentResult(
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

  it('bounds model-visible activity text and retains a disk pointer', () => {
    const content = boundedModelVisibleActivityText('界'.repeat(2_000), [
      'artifacts/iterations/ITER-0001/activity-trace.jsonl',
    ]);

    expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(
      MAX_MODEL_VISIBLE_ACTIVITY_BYTES,
    );
    expect(content).toContain('activity-trace.jsonl');
    expect(content).toContain('full child events remain in local TUI details');
    expect(() =>
      boundedModelVisibleActivityText('界'.repeat(2_000), [], {
        preserveWholeText: true,
      }),
    ).toThrow('Persist a shorter question');
  });

  it('creates and renders a bounded TUI-only entry without task or child transcript copies', () => {
    const entry = createActivityResultEntryData(
      details({
        status: 'completed',
        exitCode: 0,
        output: `Completed.\n${'detail '.repeat(2_000)}`,
      }),
      ['artifacts/iterations/ITER-0001/activity-trace.jsonl'],
    );

    expect(
      Buffer.byteLength(JSON.stringify(entry), 'utf8'),
    ).toBeLessThanOrEqual(MAX_ACTIVITY_ENTRY_BYTES);
    expect(entry).not.toHaveProperty('messages');
    expect(entry).not.toHaveProperty('task');
    expect(entry).not.toHaveProperty('stderr');
    expect(entry.output_summary).toContain('summary bounded');

    const collapsed = renderActivityResultEntry(
      entry,
      { expanded: false },
      theme,
    )
      .render(120)
      .join('\n');
    const expanded = renderActivityResultEntry(entry, { expanded: true }, theme)
      .render(120)
      .join('\n');

    expect(collapsed).toContain('✓ pair · coder');
    expect(expanded).toContain('─── Activity summary ───');
    expect(expanded).toContain('Child events observed: 2');
    expect(expanded).toContain('activity-trace.jsonl');
  });

  it('renders a concise activity-agent tool call header', () => {
    const output = renderActivityAgentCall(
      { instructions: 'Prioritize the selected acceptance scenario.' },
      theme,
    )
      .render(120)
      .join('\n');

    expect(output).toContain('Evidence activity agent');
    expect(output).toContain('Prioritize the selected acceptance scenario.');
  });
});
