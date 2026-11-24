import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderDeliverables } from '@evidence-poc/evidence-acceptance';
import { writeOutput } from '@evidence-poc/evidence-api';
import { checkWorkspacePath } from '@evidence-poc/evidence-model-io';
import { exportContexts } from './exportContexts.js';
import type { CommandContext, CommandOptions } from '../context.js';
import { getWorkspace, loadModel } from '../model.js';

export interface ExportVerifyResult {
  readonly synchronized: boolean;
  readonly missingFiles: readonly string[];
  readonly staleFiles: readonly string[];
  readonly extraFiles: readonly string[];
}

/** Exact bytes, no writes, and no symlink traversal in a dedicated output tree. */
export function verifyDeliverables(
  out: string,
  expected: Readonly<Record<string, string>>,
): ExportVerifyResult {
  const existing = new Set<string>();
  const nonRegularFiles = new Set<string>();
  const walk = (dir: string, prefix = ''): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${name}/`);
      else {
        existing.add(name);
        if (!entry.isFile()) nonRegularFiles.add(name);
      }
    }
  };
  walk(out);
  const missingFiles: string[] = [],
    staleFiles: string[] = [];
  for (const [name, content] of Object.entries(expected)) {
    if (!existing.has(name)) missingFiles.push(name);
    else if (
      nonRegularFiles.has(name) ||
      !readFileSync(path.join(out, name)).equals(Buffer.from(content))
    )
      staleFiles.push(name);
  }
  const extraFiles = [...existing]
    .filter((name) => !Object.hasOwn(expected, name))
    .sort();
  return {
    synchronized:
      !missingFiles.length && !staleFiles.length && !extraFiles.length,
    missingFiles: missingFiles.sort(),
    staleFiles: staleFiles.sort(),
    extraFiles,
  };
}

export async function exportCommand(
  values: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const workspace = getWorkspace(context, values);
  const watch = values.watch === true;
  const verify = values.verify === true;
  if (watch || values.onlyUnblocked) {
    if (values.tests || (watch && verify))
      throw new Error(
        'Context API sync cannot be combined with --tests, or --watch with --verify.',
      );
    checkWorkspacePath(workspace.root, workspace.delivery, 'directory');
    return exportContexts(workspace.root, { verify, watch }, context);
  }
  const model = await loadModel(workspace.model);
  const openapi = values.openapi === true || !values.tests;
  const tests = values.tests === true || !values.openapi;
  const { files, endpointCount, flowCount, stepCount } =
    await renderDeliverables(model, { openapi, tests });
  const { 'openapi.json': contract, ...acceptance } = files;
  const outputs: [string, Record<string, string>][] = [];
  if (openapi && contract !== undefined)
    outputs.push([workspace.release, { 'openapi.json': contract }]);
  if (tests) outputs.push([workspace.acceptance, acceptance]);
  for (const [directory] of outputs)
    checkWorkspacePath(workspace.root, directory, 'directory');
  if (verify) {
    const differences = outputs.flatMap(([directory, expected]) => {
      const result = verifyDeliverables(directory, expected);
      const prefix = path.relative(workspace.root, directory);
      return [
        ...result.missingFiles.map(
          (file) => `MISSING: ${path.join(prefix, file)}`,
        ),
        ...result.staleFiles.map(
          (file) => `MODIFIED: ${path.join(prefix, file)}`,
        ),
        ...result.extraFiles.map((file) => `EXTRA: ${path.join(prefix, file)}`),
      ];
    });
    if (differences.length) {
      context.stderr(differences.join('\n'));
      return 1;
    }
    context.stdout(
      'Deliverables synchronized (exact byte comparison; no files written).',
    );
    return 0;
  }
  for (const [directory, expected] of outputs) {
    if (verifyDeliverables(directory, expected).synchronized) continue;
    mkdirSync(path.dirname(directory), { recursive: true });
    writeOutput(directory, expected);
  }
  context.stdout(
    `OpenAPI 3.1 validation: PASSED (${endpointCount} endpoints)\nAcceptance: ${flowCount} flows, ${stepCount} steps`,
  );
  for (const [directory] of outputs) context.stdout(directory);
  return 0;
}
