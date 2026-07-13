import { afterEach, describe, expect, it } from 'vitest';
import { cleanupWorkspaces, workspace, write } from '../tests/support';
import {
  appendPhaseSubagentEvent,
  loadPhaseAgent,
  phaseAgentName,
  phaseAgentProgress,
  phaseAgentResult,
} from './phase-runner';

afterEach(cleanupWorkspaces);

describe('phase subagents', () => {
  it('defines a valid project subagent for every executable phase', () => {
    const phases = [
      'frame',
      'clarify',
      'specify',
      'validate',
      'domain_model',
      'architecture',
      'planning',
      'coding',
      'review',
      'learn',
    ] as const;

    for (const phase of phases) {
      const agent = loadPhaseAgent(process.cwd(), phase);
      expect(agent.name).toBe(phaseAgentName(phase));
      expect(agent.model).toContain('/');
      expect(agent.systemPrompt.length).toBeGreaterThan(100);
    }
  });

  it('loads the phase role, model, thinking level, and tools from one agent definition', () => {
    const cwd = workspace();
    write(
      cwd,
      '.pi/agents/coder.md',
      `---\nname: coder\ndescription: Implements one scenario\nmodel: openai-codex/gpt-test\nthinking: medium\ntools: read, write, evidence_orchestrator_complete_phase\n---\n\nRun strict TDD.\n`,
    );

    expect(loadPhaseAgent(cwd, 'coding')).toMatchObject({
      name: 'coder',
      model: 'openai-codex/gpt-test',
      thinking: 'medium',
      tools: ['read', 'write', 'evidence_orchestrator_complete_phase'],
      systemPrompt: 'Run strict TDD.',
    });
  });

  it('streams finalized child messages into an immutable running snapshot', () => {
    const messages = [] as Parameters<typeof appendPhaseSubagentEvent>[0];

    expect(
      appendPhaseSubagentEvent(messages, {
        type: 'message_end',
        message: {
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
      }),
    ).toBe(true);
    expect(
      appendPhaseSubagentEvent(messages, {
        type: 'tool_result_end',
        message: {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'bash',
          content: [{ type: 'text', text: 'tests passed' }],
          details: {},
          isError: false,
        } as never,
      }),
    ).toBe(true);
    expect(appendPhaseSubagentEvent(messages, { type: 'turn_start' })).toBe(
      false,
    );
    appendPhaseSubagentEvent(messages, {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'The phase evidence is complete.' }],
      } as never,
    });

    const progress = phaseAgentProgress(
      { name: 'coder', model: 'openai-codex/gpt-test', thinking: 'medium' },
      messages,
    );

    expect(progress).toMatchObject({
      agent: 'coder',
      exitCode: -1,
      output: 'The phase evidence is complete.',
    });
    expect(progress.messages).toHaveLength(3);
    messages.push({ role: 'user', content: 'later message' } as never);
    expect(progress.messages).toHaveLength(3);

    const failure = phaseAgentResult(
      { name: 'coder', model: 'openai-codex/gpt-test', thinking: 'medium' },
      progress.messages,
      1,
      'child stderr',
    );
    expect(failure.output).toContain('Phase subagent coder failed with exit 1');
    expect(failure.output).toContain('The phase evidence is complete.');
    expect(failure.output).toContain('child stderr');
  });

  it('does not fall back when the required project agent is absent', () => {
    const cwd = workspace();
    expect(() => loadPhaseAgent(cwd, 'architecture')).toThrow(
      '.pi/agents/architect.md',
    );
  });
});
