import { lstatSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  readAcceptanceSuite,
  renderAcceptanceSuite,
} from '@evidence-poc/evidence-acceptance';
import { writeOutput } from '@evidence-poc/evidence-api';

const matches = (
  directory: string,
  expected: Record<string, string>,
): boolean => {
  if (!lstatSync(directory, { throwIfNoEntry: false }))
    return Object.keys(expected).length === 0;
  if (!lstatSync(directory).isDirectory()) return false;
  let count = 0;
  const walk = (dir: string, prefix = ''): boolean => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          !Object.keys(expected).some((name) =>
            name.startsWith(`${relative}/`),
          ) ||
          !walk(file, `${relative}/`)
        )
          return false;
      } else {
        if (
          !entry.isFile() ||
          !Object.hasOwn(expected, relative) ||
          readFileSync(file, 'utf8') !== expected[relative]
        )
          return false;
        ++count;
      }
    }
    return true;
  };
  return walk(directory) && count === Object.keys(expected).length;
};

/** Never replace hand-maintained files in the automatic export path. */
export async function prepareAcceptanceOutput(
  directory: string,
  files: Record<string, string>,
) {
  if (matches(directory, files)) return () => undefined;
  const previous = matches(directory, {})
    ? {}
    : renderAcceptanceSuite(await readAcceptanceSuite(directory));
  return () => {
    if (matches(directory, files)) return;
    if (!matches(directory, previous))
      throw new Error('验收目录含外部修改或非生成文件，未替换。');
    mkdirSync(path.dirname(directory), { recursive: true });
    writeOutput(directory, files);
  };
}
