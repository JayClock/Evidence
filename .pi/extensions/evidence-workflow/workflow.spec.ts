import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectCodeFiles, missingPaths } from './artifacts';
import { phaseModelConfig, readWorkflowConfig } from './config';
import { completePhase } from './gates';
import { DEFAULT_STATE } from './phases';
import { readState, writeState } from './state';

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

describe('phase completion guardrails', () => {
  it('rejects completing a phase that is not current', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'domain_model' });

    expect(() => completePhase(cwd, 'requirements')).toThrow(
      'current phase is domain_model',
    );
  });

  it('rejects completion when required outputs are missing', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    expect(() => completePhase(cwd, 'requirements')).toThrow(
      'missing required outputs',
    );
  });

  it('advances after required outputs exist and creates the configured gate', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    write(cwd, 'artifacts/01-requirements/personas.md');
    write(cwd, 'artifacts/01-requirements/problem-statement.md');
    write(cwd, 'artifacts/01-requirements/story-map.md');

    const state = completePhase(cwd, 'requirements', 'ready');

    expect(state.phase).toBe('domain_model');
    expect(state.pending_gate).toBe('GATE-001-requirements');
    expect(readState(cwd).artifacts).toHaveLength(3);
  });
});
