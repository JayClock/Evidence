import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import {
  appendActivityAgentEvent,
  loadActivityAgent,
  activityAgentName,
  activityAgentProgress,
  activityAgentResult,
  activityAgentArguments,
  activityAgentTelemetry,
} from './activity-agent-process';

afterEach(cleanupWorkspaces);

describe('activity agents', () => {
  it('loads every bounded role directly without a phase-agent map', () => {
    const agents = [
      'inbox-analyst',
      'requirements-analyst',
      'domain-modeler',
      'model-challenger',
      'architect',
      'test-driver',
      'production-driver',
      'change-explainer',
      'showcase-reviewer',
      'respond-learner',
    ];
    for (const name of agents) {
      const agent = loadActivityAgent(process.cwd(), name);
      expect(agent.name).toBe(activityAgentName(name));
      expect(agent.model).toContain('/');
      expect(agent.systemPrompt.length).toBeGreaterThan(100);
    }
    expect(existsSync(`${process.cwd()}/.pi/agents/coder.md`)).toBe(false);
    expect(existsSync(`${process.cwd()}/.pi/agents/planner.md`)).toBe(false);
  });

  it('keeps Challenger, Showcase, and Respond roles read-only', () => {
    for (const name of [
      'model-challenger',
      'change-explainer',
      'showcase-reviewer',
      'respond-learner',
    ]) {
      const agent = loadActivityAgent(process.cwd(), name);
      expect(agent.tools).not.toEqual(
        expect.arrayContaining(['write', 'edit', 'bash']),
      );
    }
  });

  it('loads one explicit role definition without fallback', () => {
    const cwd = workspace();
    write(
      cwd,
      '.pi/agents/test-driver.md',
      `---\nname: test-driver\ndescription: Writes one behavior test\nmodel: openai-codex/gpt-test\nthinking: medium\ntools: read, write\n---\n\nWrite one bounded test and stop.\n`,
    );

    expect(loadActivityAgent(cwd, 'test-driver')).toMatchObject({
      name: 'test-driver',
      model: 'openai-codex/gpt-test',
      thinking: 'medium',
      tools: ['read', 'write'],
    });
    expect(() => loadActivityAgent(cwd, 'architect')).toThrow(
      '.pi/agents/architect.md',
    );
  });

  it('keeps ordinary checkpoints ephemeral and resumes a named TQA session', () => {
    const agent = {
      model: 'openai-codex/gpt-test',
      thinking: 'high' as const,
      tools: ['read', 'evidence_orchestrator_ask_question'],
    };
    const ephemeral = activityAgentArguments({
      agent,
      promptPath: '/tmp/requirements-analyst.md',
      task: 'Prepare one candidate.',
    });
    expect(ephemeral).toContain('--no-session');
    expect(ephemeral).not.toContain('--session-id');

    const continued = activityAgentArguments({
      agent,
      promptPath: '/tmp/requirements-analyst.md',
      task: 'Continue TQA.',
      sessionId: 'evidence-iter-0001-us-001-tqa',
    });
    expect(continued).toEqual(
      expect.arrayContaining(['--session-id', 'evidence-iter-0001-us-001-tqa']),
    );
    expect(continued).not.toContain('--no-session');
  });

  it('aggregates finalized assistant usage, actual model, stop data, and tool calls', () => {
    const messages = [
      {
        role: 'assistant',
        model: 'requested-model',
        responseModel: 'fallback-model',
        stopReason: 'toolUse',
        usage: {
          input: 1_000,
          output: 100,
          cacheRead: 800,
          cacheWrite: 20,
          totalTokens: 1_920,
          cost: { total: 0.01 },
        },
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'read',
            arguments: { path: 'one.md' },
          },
          {
            type: 'toolCall',
            id: 'call-2',
            name: 'read',
            arguments: { path: 'two.md' },
          },
        ],
      },
      {
        role: 'assistant',
        model: 'fallback-model',
        stopReason: 'stop',
        usage: {
          input: 2_000,
          output: 250,
          cacheRead: 1_500,
          cacheWrite: 0,
          totalTokens: 2_750,
          cost: { total: 0.025 },
        },
        content: [{ type: 'text', text: 'Done.' }],
      },
    ] as never;

    expect(activityAgentTelemetry(messages)).toEqual({
      actualModel: 'fallback-model',
      usage: {
        turns: 2,
        input_tokens: 3_000,
        output_tokens: 350,
        cache_read_tokens: 2_300,
        cache_write_tokens: 20,
        cost_usd: 0.035,
        context_tokens_at_end: 2_750,
      },
      stopReason: 'stop',
      toolCallCounts: { read: 2 },
    });
  });

  it('keeps provider cost unreported instead of treating it as zero', () => {
    const messages = [
      {
        role: 'assistant',
        model: 'provider/model',
        stopReason: 'error',
        errorMessage: 'provider failed',
        usage: {
          input: 10,
          output: 2,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 12,
        },
        content: [],
      },
    ] as never;

    expect(activityAgentTelemetry(messages)).toMatchObject({
      usage: {
        turns: 1,
        cost_usd: null,
        context_tokens_at_end: 12,
      },
      stopReason: 'error',
      errorMessage: 'provider failed',
    });
    expect(
      activityAgentResult(
        {
          name: 'architect',
          model: 'requested/model',
          thinking: 'medium',
        },
        messages,
        0,
      ),
    ).toMatchObject({
      exitCode: 0,
      stopReason: 'error',
      errorMessage: 'provider failed',
      actualModel: 'provider/model',
      output: expect.stringContaining('failed with exit 0 (error)'),
    });
  });

  it('streams finalized child messages into an immutable running snapshot', () => {
    const messages = [] as Parameters<typeof appendActivityAgentEvent>[0];
    appendActivityAgentEvent(messages, {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'The activity checkpoint is complete.' },
        ],
      } as never,
    });
    const identity = {
      name: 'architect',
      model: 'openai-codex/gpt-test',
      thinking: 'medium' as const,
    };
    const progress = activityAgentProgress(identity, messages);
    expect(progress).toMatchObject({
      agent: 'architect',
      requestedModel: 'openai-codex/gpt-test',
      actualModel: 'openai-codex/gpt-test',
      exitCode: -1,
      output: 'The activity checkpoint is complete.',
      usage: { turns: 1, cost_usd: null },
      durationMs: 0,
    });
    messages.push({ role: 'user', content: 'later' } as never);
    expect(progress.messages).toHaveLength(1);

    const failure = activityAgentResult(
      identity,
      progress.messages,
      1,
      'stderr',
    );
    expect(failure.output).toContain('failed with exit 1');
    expect(failure.output).toContain('stderr');
  });
});
