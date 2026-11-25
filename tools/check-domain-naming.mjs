import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const examples = join(root, 'examples');
const entityPath = '.evidence/model/entities';
// Only active workspaces. The nested b2b-escrow/baseline-v1 is immutable.
const counts = new Map([
  ['agile-sprint', 11],
  ['b2b-escrow', 45],
  ['digital-advertising', 17],
  ['full-spectrum-procurement', 36],
  ['shared-settlement', 10],
]);
const bilingual = /^(.+)（([A-Za-z0-9\s&/\-.]+)）$/u;
const academic = /角色|当事人|上下文|标的物|Role|Party|Context|Thing/iu;
const block = (message) => {
  console.error(`BLOCKING: ${message}`);
  process.exitCode = 1;
};

function check(workspace) {
  const selected = workspace === undefined ? undefined : resolve(workspace);
  const names = [...counts.keys()].filter(
    (name) => selected === undefined || selected === join(examples, name),
  );
  if (!names.length) {
    block(
      `--workspace must point to an active examples workspace; got ${JSON.stringify(workspace)}`,
    );
    return;
  }

  if (selected === undefined) {
    for (const entry of readdirSync(examples, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        !counts.has(entry.name) &&
        existsSync(join(examples, entry.name, entityPath))
      ) {
        block(
          `examples/${entry.name}: active workspace has no expected entity count`,
        );
      }
    }
  }

  let total = 0;
  const warnings = [];
  for (const name of names) {
    const dir = join(examples, name, entityPath);
    let files;
    try {
      files = readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      block(`${relative(root, dir)}: ${error.message}`);
      continue;
    }
    total += files.length;
    if (files.length !== counts.get(name)) {
      block(
        `${relative(root, dir)}: expected ${counts.get(name)} entity files, found ${files.length}`,
      );
    }

    for (const file of files) {
      const path = join(dir, file);
      const field = `${relative(root, path)}#label`;
      let label;
      try {
        label = JSON.parse(readFileSync(path, 'utf8'))?.label;
      } catch (error) {
        block(
          `${relative(root, path)}: could not read entity JSON: ${error.message}`,
        );
        continue;
      }
      const parts = typeof label === 'string' ? label.match(bilingual) : null;
      const value = JSON.stringify(label) ?? '<missing>';
      if (
        !parts ||
        parts[0] !== label ||
        !/\p{Script=Han}/u.test(parts[1]) ||
        !/[A-Za-z]/.test(parts[2]) ||
        parts[1] !== parts[1].trim() ||
        parts[2] !== parts[2].trim() ||
        /[\r\n\t]/.test(parts[2])
      ) {
        block(
          `${field}: expected 业务中文名（English Business Name）, got ${value}`,
        );
      }
      const forbidden =
        typeof label === 'string' ? label.match(academic) : null;
      if (forbidden) {
        block(
          `${field}: forbidden metamodel term ${JSON.stringify(forbidden[0])} in ${value}; use 业务中文名（English Business Name）`,
        );
      }
      const acronym = parts?.[2]
        .match(/\brfp\b/gi)
        ?.find((word) => word !== 'RFP');
      if (acronym) warnings.push(`${field}\t${value}\t${acronym} → RFP`);
    }
  }

  if (warnings.length) {
    console.warn(
      `WARNING: non-standard acronym casing\nField\tLabel\tSuggestion\n${warnings.join('\n')}`,
    );
  }
  if (!process.exitCode) console.log(`PASS: ${total} entities verified`);
}

try {
  const { values } = parseArgs({ options: { workspace: { type: 'string' } } });
  check(values.workspace);
} catch (error) {
  block(error.message);
}
