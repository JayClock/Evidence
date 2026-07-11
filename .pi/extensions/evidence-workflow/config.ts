import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Phase } from './types';

export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export interface PhaseModelConfig {
  provider: string;
  model: string;
  thinking: ThinkingLevel;
}

export interface WorkflowConfig {
  phaseModels: Partial<Record<Exclude<Phase, 'complete'>, PhaseModelConfig>>;
}

const THINKING_LEVELS = new Set<ThinkingLevel>([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export function workflowConfigPath(cwd: string): string {
  return join(cwd, '.pi', 'evidence-workflow.json');
}

export function readWorkflowConfig(cwd: string): WorkflowConfig {
  const path = workflowConfigPath(cwd);
  if (!existsSync(path)) return { phaseModels: {} };

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    phaseModels?: Record<string, Partial<PhaseModelConfig>>;
  };
  const phaseModels = parsed.phaseModels ?? {};
  for (const [phase, config] of Object.entries(phaseModels)) {
    if (
      !config ||
      typeof config.provider !== 'string' ||
      typeof config.model !== 'string' ||
      !THINKING_LEVELS.has(config.thinking as ThinkingLevel)
    ) {
      throw new Error(
        `Invalid model configuration for phase ${phase} in ${path}.`,
      );
    }
  }
  return { phaseModels: phaseModels as WorkflowConfig['phaseModels'] };
}

export function phaseModelConfig(
  cwd: string,
  phase: Phase,
): PhaseModelConfig | undefined {
  if (phase === 'complete') return undefined;
  return readWorkflowConfig(cwd).phaseModels[phase];
}

export function formatPhaseModel(config?: PhaseModelConfig): string {
  return config
    ? `${config.provider}/${config.model} (thinking=${config.thinking})`
    : 'current session model';
}
