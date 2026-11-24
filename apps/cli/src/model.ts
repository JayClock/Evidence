import path from 'node:path';
import {
  findWorkspace,
  openWorkspace,
  readModelRoot,
} from '@evidence-poc/evidence-model-io';
import {
  stringOption,
  type CommandContext,
  type CommandOptions,
} from './context.js';

export function getWorkspace(context: CommandContext, options: CommandOptions) {
  const workspace = stringOption(options.workspace);
  return workspace === undefined
    ? findWorkspace(context.cwd)
    : openWorkspace(path.resolve(context.cwd, workspace));
}

export async function loadModel(source: string) {
  const { bundle, issues } = await readModelRoot(source);
  if (issues.length)
    throw new Error(
      `FM_INVALID:\n${issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')}`,
    );
  return bundle;
}
