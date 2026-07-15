import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import {
  appendActivitySubagentEvent,
  loadActivityAgent,
  activityAgentName,
  activityAgentProgress,
  activityAgentResult,
} from './activity-agent-process';

afterEach(cleanupWorkspaces);

describe('activity subagents', () => {
  it('loads every bounded role directly without a phase-agent map', () => {
    const agents = [
      'requirements-analyst',
      'domain-modeler',
      'model-challenger',
      'architect',
      'test-driver',
      'production-driver',
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
      'showcase-reviewer',
      'respond-learner',
    ]) {
      const agent = loadActivityAgent(process.cwd(), name);
      expect(agent.tools).not.toEqual(
        expect.arrayContaining(['write', 'edit']),
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

  it('streams finalized child messages into an immutable running snapshot', () => {
    const messages = [] as Parameters<typeof appendActivitySubagentEvent>[0];
    appendActivitySubagentEvent(messages, {
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
      exitCode: -1,
      output: 'The activity checkpoint is complete.',
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
