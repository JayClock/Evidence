import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  buildProjection,
  diagnosticToJson,
  hasErrors,
  loadDesign,
  loadFm,
} from '@evidence-poc/evidence-api';
import {
  compareContracts,
  compareOpenApiContracts,
} from './diff/compareContracts.js';
import { OasdiffError } from './diff/oasdiffRunner.js';

export interface DiffCliOptions {
  command: 'diff';
  base: string;
  target: string;
  format: 'json' | 'markdown';
  baseApi?: string;
  api?: string;
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
  for (const [value, name, required] of [
    [options.base, 'base', true],
    [options.target, 'target', true],
    [options.baseApi, 'base-api', false],
    [options.api, 'api', false],
  ] as const) {
    if (value === undefined) {
      if (required)
        return { output: null, error: `--${name} 是必需的`, exitCode: 2 };
    } else if (value === '')
      return { output: null, error: `--${name} 是必需的`, exitCode: 2 };
    else if (!path.isAbsolute(value))
      return {
        output: null,
        error: `PATH_NOT_ABSOLUTE: --${name} 必须使用绝对路径`,
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
      if (options.baseApi !== undefined || options.api !== undefined)
        throw new Error(
          'API_DIFF_OVERLAY_INVALID: 已导出的契约不能再应用覆盖文件',
        );
      const diff = await compareOpenApiContracts(baseArtifact, targetArtifact);
      return {
        output: options.format === 'json' ? diff : diff.changelog,
        exitCode: diff.hasBreakingChanges ? 1 : 0,
      };
    }
    const base = await loadFm(options.base),
      target = await loadFm(options.target);
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
    const overlays = [options.baseApi, options.api].map((file) =>
      file === undefined ? undefined : loadDesign(file),
    );
    const invalid = overlays.flatMap((overlay) => overlay?.diagnostics ?? []);
    if (hasErrors(invalid))
      return {
        output: { valid: false, diagnostics: invalid.map(diagnosticToJson) },
        exitCode: 2,
      };
    const before = buildProjection({
      index: base.index,
      ...(overlays[0]?.design == null ? {} : { design: overlays[0].design }),
    }).projection;
    const after = buildProjection({
      index: target.index,
      ...(overlays[1]?.design == null ? {} : { design: overlays[1].design }),
    }).projection;
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
