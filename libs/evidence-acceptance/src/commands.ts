import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  buildProjection,
  diagnosticToJson,
  loadModel,
} from '@evidence-poc/evidence-api';
import {
  compareContracts,
  compareOpenApiContracts,
} from './diff/compareContracts.js';
import { OasdiffError } from './diff/oasdiffRunner.js';

export interface DiffCliOptions {
  base: string;
  target: string;
  format: 'json' | 'markdown';
}

export interface CliResult {
  output: unknown;
  error?: string;
  exitCode: number;
}

const isDirectory = (target: string): boolean => {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
};

const readOpenApiArtifact = (
  file: string,
): Record<string, unknown> | undefined => {
  if (!file.endsWith('.json') || isDirectory(file)) return undefined;
  const input: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return typeof input === 'object' && input !== null && 'openapi' in input
    ? (input as Record<string, unknown>)
    : undefined;
};

export const runDiff = async (options: DiffCliOptions): Promise<CliResult> => {
  for (const name of ['base', 'target'] as const) {
    if (!options[name])
      return {
        output: null,
        error: `API_DIFF_INPUT_REQUIRED: ${name}`,
        exitCode: 2,
      };
    if (!path.isAbsolute(options[name]))
      return {
        output: null,
        error: `PATH_NOT_ABSOLUTE: ${name} must be an absolute path`,
        exitCode: 2,
      };
  }
  try {
    const baseArtifact = readOpenApiArtifact(options.base);
    const targetArtifact = readOpenApiArtifact(options.target);
    if (baseArtifact !== undefined || targetArtifact !== undefined) {
      if (baseArtifact === undefined || targetArtifact === undefined)
        throw new Error(
          'API_DIFF_INPUT_MISMATCH: 基线和目标必须同为模型或 OpenAPI JSON',
        );
      const diff = await compareOpenApiContracts(baseArtifact, targetArtifact);
      return {
        output: options.format === 'json' ? diff : diff.changelog,
        exitCode: diff.hasBreakingChanges ? 1 : 0,
      };
    }
    const base = await loadModel(options.base),
      target = await loadModel(options.target);
    if (base.index === null || target.index === null)
      return {
        output: {
          valid: false,
          diagnostics: [...base.diagnostics, ...target.diagnostics].map(
            diagnosticToJson,
          ),
        },
        exitCode: 2,
      };
    const before = buildProjection({ index: base.index }).projection;
    const after = buildProjection({ index: target.index }).projection;
    const diff = await compareContracts(before, after);
    return {
      output: options.format === 'json' ? diff : diff.changelog,
      exitCode: diff.hasBreakingChanges ? 1 : 0,
    };
  } catch (error) {
    return {
      output: null,
      error:
        error instanceof OasdiffError
          ? [error.message, error.stdout, error.stderr]
              .filter(Boolean)
              .join('\n')
          : error instanceof Error
            ? error.message
            : String(error),
      exitCode: 2,
    };
  }
};
