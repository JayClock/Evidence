import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectCodeFiles, missingPaths } from './artifacts';
import { phaseModelConfig, readWorkflowConfig } from './config';
import { completePhase } from './gates';
import { DEFAULT_STATE, nextPhase, PHASE_META, PHASE_ORDER } from './phases';
import { registerCommands } from './commands';
import { registerTools } from './tools';
import { buildPhasePrompt } from './prompts';
import { readState, selectWorkItem, writeState } from './state';

const workspaces: string[] = [];

function workspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'evidence-workflow-'));
  workspaces.push(cwd);
  return cwd;
}

function write(cwd: string, path: string, content = 'content'): void {
  const absolute = join(cwd, path);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content);
}

afterEach(() => {
  for (const cwd of workspaces.splice(0)) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

describe('phase model configuration', () => {
  it('loads an OpenAI model and reasoning level for each configured phase', () => {
    const cwd = workspace();
    write(
      cwd,
      '.pi/evidence-workflow.json',
      JSON.stringify({
        phaseModels: {
          coding: {
            provider: 'openai',
            model: 'gpt-5.6-terra',
            thinking: 'medium',
          },
        },
      }),
    );

    expect(phaseModelConfig(cwd, 'coding')).toEqual({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      thinking: 'medium',
    });
    expect(phaseModelConfig(cwd, 'complete')).toBeUndefined();
  });

  it('rejects unsupported reasoning levels', () => {
    const cwd = workspace();
    write(
      cwd,
      '.pi/evidence-workflow.json',
      JSON.stringify({
        phaseModels: {
          review: {
            provider: 'openai',
            model: 'gpt-5.6-sol',
            thinking: 'ultra',
          },
        },
      }),
    );

    expect(() => readWorkflowConfig(cwd)).toThrow(
      'Invalid model configuration for phase review',
    );
  });
});

describe('Evidence workflow monorepo discovery', () => {
  it('collects apps and libs code while excluding generated output', () => {
    const cwd = workspace();
    write(cwd, 'apps/web/src/app.tsx');
    write(cwd, 'apps/web/out-tsc/app.js');
    write(cwd, 'apps/server/target/debug/generated.rs');
    write(cwd, 'libs/web/ui/src/button.spec.tsx');

    expect(collectCodeFiles(cwd)).toEqual([
      'apps/web/src/app.tsx',
      'libs/web/ui/src/button.spec.tsx',
    ]);
  });

  it('treats missing and empty required directories as missing', () => {
    const cwd = workspace();
    mkdirSync(join(cwd, 'artifacts/05-code'), { recursive: true });
    write(cwd, 'empty.md', '');

    expect(
      missingPaths(cwd, [
        'artifacts/05-code/',
        'apps/',
        'empty.md',
        'missing.md',
      ]),
    ).toEqual(['artifacts/05-code/', 'apps/', 'empty.md', 'missing.md']);
  });
});

describe('P0 knowledge-feedback workflow', () => {
  it('starts a new iteration with frame, clarification, specification, and validation', () => {
    expect(PHASE_ORDER.slice(0, 4)).toEqual([
      'frame',
      'clarify',
      'specify',
      'validate',
    ]);
    expect(DEFAULT_STATE.phase).toBe('frame');
    expect(PHASE_META.frame.gateId).toBe('GATE-101-frame');
    expect(PHASE_META.clarify.outputs).toContain(
      'artifacts/01-requirements/clarifications/',
    );
    expect(PHASE_META.specify.outputs).toContain(
      'artifacts/01-requirements/examples/',
    );
  });

  it('migrates a legacy requirements phase to frame', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'frame' });
    write(
      cwd,
      'evidence-state.json',
      JSON.stringify({ ...DEFAULT_STATE, phase: 'requirements' }),
    );

    expect(readState(cwd).phase).toBe('frame');
  });

  it('requires TQA clarification and concrete examples in the requirement prompts', () => {
    const cwd = workspace();
    write(cwd, 'artifacts/00-user-input/requirements.md');
    writeState(cwd, { ...DEFAULT_STATE, phase: 'clarify' });

    expect(buildPhasePrompt(cwd)).toContain('TQA');
    writeState(cwd, { ...DEFAULT_STATE, phase: 'specify' });
    expect(buildPhasePrompt(cwd)).toContain('Given/When/Then');
  });

  it('requires model expansion and test processes before implementation', () => {
    expect(PHASE_META.domain_model.outputs).toEqual(
      expect.arrayContaining([
        'artifacts/02-domain-model/domain-model.mmd',
        'artifacts/02-domain-model/model-expansions/',
        'artifacts/02-domain-model/validation-report.md',
      ]),
    );
    expect(PHASE_META.architecture.outputs).toEqual(
      expect.arrayContaining([
        'artifacts/03-architecture/test-strategy.md',
        'artifacts/03-architecture/test-processes/',
      ]),
    );
  });

  it('selects exactly one story scenario for the coding phase', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });

    const state = selectWorkItem(cwd, 'US-042', 'SC-003');

    expect(state.active_work_item).toEqual({
      story_id: 'US-042',
      scenario_id: 'SC-003',
    });
    expect(buildPhasePrompt(cwd)).toContain('US-042 / SC-003');
  });

  it('adds a learning phase after review instead of completing immediately', () => {
    expect(PHASE_ORDER.at(-3)).toBe('review');
    expect(PHASE_ORDER.at(-2)).toBe('learn');
    expect(nextPhase('review')).toBe('learn');
    expect(PHASE_META.learn.outputs).toEqual([
      'artifacts/07-learning/iteration-summary.md',
      'artifacts/07-learning/next-iteration.md',
    ]);
  });

  it('loads command and tool registrations with the new workflow state types', () => {
    expect(registerCommands).toBeTypeOf('function');
    expect(registerTools).toBeTypeOf('function');
  });

  it('does not complete coding without scenario-specific evidence', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'coding',
      active_work_item: { story_id: 'US-042', scenario_id: 'SC-003' },
    });
    write(cwd, 'apps/web/src/app.tsx');
    write(cwd, 'libs/web/ui/src/button.spec.tsx');
    write(cwd, 'artifacts/05-code/other.md');

    expect(() => completePhase(cwd, 'coding')).toThrow(
      'missing scenario evidence artifacts/05-code/US-042/SC-003.md',
    );
  });
});

describe('phase completion guardrails', () => {
  it('rejects completing a phase that is not current', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'domain_model' });

    expect(() => completePhase(cwd, 'frame')).toThrow(
      'current phase is domain_model',
    );
  });

  it('rejects completion when required outputs are missing', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    expect(() => completePhase(cwd, 'frame')).toThrow(
      'missing required outputs',
    );
  });

  it('advances after required outputs exist and creates the configured gate', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    write(cwd, 'artifacts/01-requirements/personas.md');
    write(cwd, 'artifacts/01-requirements/problem-statement.md');
    write(cwd, 'artifacts/01-requirements/business-context.md');
    write(cwd, 'artifacts/01-requirements/user-journeys.md');
    write(cwd, 'artifacts/01-requirements/story-map.md');

    const state = completePhase(cwd, 'frame', 'ready');

    expect(state.phase).toBe('clarify');
    expect(state.pending_gate).toBeNull();
    expect(readState(cwd).artifacts).toHaveLength(5);
  });
});
