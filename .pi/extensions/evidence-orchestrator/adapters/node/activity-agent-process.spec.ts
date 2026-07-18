import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import { createActivityToolPolicy } from '../../capabilities/worktree-protection/activity-tool-policy';
import {
  ActivityAgentAbortedError,
  appendActivityAgentEvent,
  loadActivityAgent,
  activityAgentName,
  activityAgentProgress,
  activityAgentResult,
  activityAgentArguments,
  activityAgentTelemetry,
  runActivityAgent,
} from './activity-agent-process';

afterEach(cleanupWorkspaces);

function activityChild(closeOnTerm: boolean) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    exitCode: number | null;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.kill = vi.fn((signal: NodeJS.Signals) => {
    if (signal === 'SIGKILL' || (signal === 'SIGTERM' && closeOnTerm)) {
      queueMicrotask(() => child.emit('close', null, signal));
    }
    return true;
  });
  return child;
}

function writeActivityAgent(cwd: string): void {
  write(
    cwd,
    '.pi/agents/test-driver.md',
    `---\nname: test-driver\ndescription: Writes one behavior test\nmodel: openai-codex/gpt-test\nthinking: medium\ntools: read, write\n---\n\nWrite one bounded test and stop.\n`,
  );
}

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
      'red-reviewer',
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

  it('removes global status from every dispatched role while keeping Inbox narrow', () => {
    for (const name of [
      'requirements-analyst',
      'domain-modeler',
      'model-challenger',
      'architect',
      'test-driver',
      'production-driver',
      'red-reviewer',
      'showcase-reviewer',
      'respond-learner',
      'change-explainer',
      'inbox-analyst',
    ]) {
      expect(loadActivityAgent(process.cwd(), name).tools).not.toContain(
        'evidence_orchestrator_status',
      );
    }
    expect(loadActivityAgent(process.cwd(), 'inbox-analyst').tools).toEqual([
      'read',
      'evidence_orchestrator_propose_inbox_stories',
    ]);
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
    expect(ephemeral).toContain('--no-prompt-templates');
    expect(ephemeral).not.toContain('--no-context-files');
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
        provider: 'fallback-provider',
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
        provider: 'fallback-provider',
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
      actualModel: 'fallback-provider/fallback-model',
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

  it('terminates then kills a child at its approved deadline and returns timeout', async () => {
    const cwd = workspace();
    writeActivityAgent(cwd);
    const child = activityChild(false);
    const spawnProcess = vi.fn(() => child) as never;
    const result = await runActivityAgent({
      cwd,
      iterationId: 'ITER-0001',
      activityLeaseId: 'lease-00000000-0000-4000-8000-000000000001',
      boardRoot: '/tmp/evidence-board',
      agentName: 'test-driver',
      task: 'Write one test.',
      policy: createActivityToolPolicy({
        cwd,
        role: 'test-driver',
        timeoutMs: 10,
      }),
      spawnProcess,
      forceKillGraceMs: 5,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          EVIDENCE_ITERATION_ID: 'ITER-0001',
          EVIDENCE_ACTIVITY_LEASE_ID:
            'lease-00000000-0000-4000-8000-000000000001',
          EVIDENCE_BOARD_ROOT: '/tmp/evidence-board',
        }),
      }),
    );
    expect(child.kill.mock.calls.map(([signal]) => signal)).toEqual([
      'SIGTERM',
      'SIGKILL',
    ]);
    expect(result).toMatchObject({
      exitCode: 1,
      stopReason: 'timeout',
      errorMessage: expect.stringContaining('timed out'),
    });
  });

  it('keeps caller abort distinct from deadline timeout', async () => {
    const cwd = workspace();
    writeActivityAgent(cwd);
    const child = activityChild(true);
    const controller = new AbortController();
    controller.abort();

    await expect(
      runActivityAgent({
        cwd,
        iterationId: 'ITER-0001',
        agentName: 'test-driver',
        task: 'Write one test.',
        policy: createActivityToolPolicy({
          cwd,
          role: 'test-driver',
          timeoutMs: 1_000,
        }),
        signal: controller.signal,
        spawnProcess: vi.fn(() => child) as never,
        forceKillGraceMs: 5,
      }),
    ).rejects.toMatchObject({
      name: ActivityAgentAbortedError.name,
      result: { stopReason: 'aborted' },
    });
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
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
