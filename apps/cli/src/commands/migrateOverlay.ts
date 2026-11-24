import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildProjection,
  loadFm,
  migrateOverlay,
} from '@evidence-poc/evidence-api';
import { checkWorkspacePath } from '@evidence-poc/evidence-model-io';
import type { CommandContext, CommandOptions } from '../context.js';
import { getWorkspace } from '../model.js';

export async function migrateOverlayCommand(
  options: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const workspace = getWorkspace(context, options);
  const directory = path.join(workspace.evidence, 'overlays');
  const input = path.join(directory, 'legacy.json');
  const output = path.join(directory, 'api-v6.json');
  checkWorkspacePath(workspace.root, input, 'file');
  checkWorkspacePath(workspace.root, output, 'file');
  const loaded = await loadFm(workspace.model);
  if (!loaded.index)
    throw new Error(loaded.diagnostics.map((item) => item.message).join('; '));
  const migrated = migrateOverlay(
    loaded.index.document,
    JSON.parse(await readFile(input, 'utf8')),
  );
  const errors = buildProjection({
    index: loaded.index,
    design: migrated,
  }).diagnostics.filter((item) => item.severity === 'error');
  if (errors.length)
    throw new Error(errors.map((item) => item.message).join('; '));
  await mkdir(directory, { recursive: true });
  await writeFile(output, JSON.stringify(migrated, null, 2) + '\n', {
    flag: 'wx',
  });
  context.stdout(`Migrated overlay to API v6: ${output}`);
  return 0;
}
