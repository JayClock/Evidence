import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EVIDENCE_COMMAND_NAMES } from '../adapters/pi/command-names';

const COMMAND_REFERENCE =
  /(?:^|[\s`"'（(])\/(evidence-[a-z][a-z-]*)(?=$|[\s`"'，。,.：:)）])/gm;

export interface EvidenceCommandReference {
  command: string;
  path: string;
  line: number;
}

function markdownFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return path.endsWith('.md') ? [path] : [];
  return readdirSync(path)
    .flatMap((entry) => markdownFiles(join(path, entry)))
    .sort();
}

export function evidenceCommandReferences(
  cwd: string,
): EvidenceCommandReference[] {
  const files = [
    ...markdownFiles(join(cwd, '.pi', 'agents')),
    ...markdownFiles(join(cwd, '.pi', 'skills')),
    ...markdownFiles(join(cwd, '.pi', 'prompts')),
    ...markdownFiles(
      join(cwd, '.pi', 'extensions', 'evidence-orchestrator', 'README.md'),
    ),
  ];

  return files.flatMap((path) => {
    const content = readFileSync(path, 'utf8');
    return [...content.matchAll(COMMAND_REFERENCE)].map((match) => ({
      command: match[1] ?? '',
      path: relative(cwd, path),
      line: content.slice(0, match.index).split('\n').length,
    }));
  });
}

export function validateEvidenceCommandReferences(cwd: string): void {
  const registered = new Set<string>(EVIDENCE_COMMAND_NAMES);
  const stale = evidenceCommandReferences(cwd).filter(
    ({ command }) => !registered.has(command),
  );
  if (stale.length > 0) {
    throw new Error(
      `Unknown Evidence command reference(s): ${stale
        .map(({ command, path, line }) => `${path}:${line} /${command}`)
        .join(', ')}.`,
    );
  }
}
