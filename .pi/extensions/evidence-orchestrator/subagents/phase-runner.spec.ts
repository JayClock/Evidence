import { afterEach, describe, expect, it } from 'vitest';
import { cleanupWorkspaces, workspace, write } from '../tests/support';
import { loadPhaseAgent, phaseAgentName } from './phase-runner';

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

  it('does not fall back when the required project agent is absent', () => {
    const cwd = workspace();
    expect(() => loadPhaseAgent(cwd, 'architecture')).toThrow(
      '.pi/agents/architect.md',
    );
  });
});
