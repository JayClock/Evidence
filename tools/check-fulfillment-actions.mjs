import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const examples = join(root, 'examples');
let requests = 0;
const issues = [];

// Historical comparison workspaces are snapshots, not active examples.
for (const entry of readdirSync(examples, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(examples, entry.name, '.evidence/model/entities');
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((name) =>
    name.endsWith('.json'),
  )) {
    const path = join(dir, file);
    const entity = JSON.parse(readFileSync(path, 'utf8'));
    const field = `${relative(root, path)}#fulfillmentAction`;
    if (
      entity.category === 'evidence' &&
      entity.kind === 'fulfillment_request'
    ) {
      requests++;
      if (
        typeof entity.fulfillmentAction !== 'string' ||
        !entity.fulfillmentAction.trim()
      )
        issues.push(`${field}: specify what the obligor is expected to do`);
    } else if ('fulfillmentAction' in entity) {
      issues.push(`${field}: only a fulfillment request may declare an action`);
    }
  }
}

if (!requests) issues.push('No active fulfillment requests were checked.');
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${requests} fulfillment actions verified`);
}
