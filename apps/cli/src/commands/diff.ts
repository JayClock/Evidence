import path from 'node:path';
import { openWorkspace } from '@evidence-poc/evidence-model-io';
import { runDiff } from '@evidence-poc/evidence-acceptance/commands';
import {
  stringOption,
  type CommandOptions,
  type CommandContext,
} from '../context.js';

export async function diffCommand(
  base: string,
  target: string,
  options: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const format = stringOption(options.format) ?? 'markdown';
  if (format !== 'json' && format !== 'markdown')
    throw new Error('--format must be json or markdown');
  const result = await runDiff({
    command: 'diff',
    base: openWorkspace(path.resolve(context.cwd, base)).model,
    target: openWorkspace(path.resolve(context.cwd, target)).model,
    format,
  });
  if (result.error) throw new Error(result.error);
  context.stdout(
    typeof result.output === 'string'
      ? result.output
      : JSON.stringify(result.output, null, 2),
  );
  return result.exitCode === 0 ? 0 : 1;
}
