import path from 'node:path';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { initializeWorkspace } from '@evidence-poc/evidence-model-io';
import {
  stringOption,
  type CommandContext,
  type CommandOptions,
} from '../context.js';

export async function initCommand(
  options: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const root = path.resolve(
    context.cwd,
    stringOption(options.workspace) ?? '.',
  );
  const name =
    stringOption(options.name) ?? (path.basename(root) || 'Evidence workspace');
  const { manifest } = await initializeWorkspace(
    root,
    createEmptyDomainModel({ name }),
  );
  context.stdout(`Initialized ${manifest}`);
  return 0;
}
