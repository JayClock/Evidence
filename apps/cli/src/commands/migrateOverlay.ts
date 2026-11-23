import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildProjection,
  loadFm,
  migrateOverlay,
} from '@evidence-poc/evidence-api';
import {
  stringOption,
  type CommandContext,
  type CommandOptions,
} from '../context.js';

export async function migrateOverlayCommand(
  options: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const input = stringOption(options.in);
  const output = stringOption(options.out);
  if (input === undefined || output === undefined)
    throw new Error('--in and --out are required');
  const model = stringOption(options.model) ?? '.evidence/fm';
  const loaded = await loadFm(path.resolve(context.cwd, model));
  if (loaded.index === null)
    throw new Error(loaded.diagnostics.map((item) => item.message).join('; '));
  const migrated = migrateOverlay(
    loaded.index.document,
    JSON.parse(readFileSync(path.resolve(context.cwd, input), 'utf8')),
  );
  const projected = buildProjection({ index: loaded.index, design: migrated });
  const errors = projected.diagnostics.filter(
    (item) => item.severity === 'error',
  );
  if (errors.length)
    throw new Error(errors.map((item) => item.message).join('; '));
  writeFileSync(
    path.resolve(context.cwd, output),
    JSON.stringify(migrated, null, 2) + '\n',
    { flag: 'wx' },
  );
  context.stdout(`Migrated overlay to API v6: ${output}`);
  return 0;
}
