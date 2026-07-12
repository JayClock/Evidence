import { afterEach, describe, expect, it } from 'vitest';
import {
  formatPhaseModel,
  phaseModelConfig,
  readWorkflowConfig,
} from './config';
import { cleanupWorkspaces, workspace, write } from './test-support';

afterEach(cleanupWorkspaces);

describe('config', () => {
  it('loads a valid phase-specific model configuration', () => {
    const cwd = workspace();
    write(
      cwd,
      '.pi/evidence-workflow.json',
      JSON.stringify({
        phaseModels: {
          coding: { provider: 'openai', model: 'gpt-test', thinking: 'medium' },
        },
      }),
    );

    expect(phaseModelConfig(cwd, 'coding')).toEqual({
      provider: 'openai',
      model: 'gpt-test',
      thinking: 'medium',
    });
    expect(formatPhaseModel(undefined)).toBe('current session model');
  });

  it('rejects invalid model settings', () => {
    const cwd = workspace();
    write(
      cwd,
      '.pi/evidence-workflow.json',
      JSON.stringify({
        phaseModels: {
          frame: { provider: 'x', model: 'y', thinking: 'ultra' },
        },
      }),
    );
    expect(() => readWorkflowConfig(cwd)).toThrow(
      'Invalid model configuration',
    );
  });
});
