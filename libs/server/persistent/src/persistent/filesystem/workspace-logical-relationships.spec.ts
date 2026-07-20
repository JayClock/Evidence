import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Ref,
  type LogicalEntityDescription,
  type LogicalRelationshipDescription,
} from '@evidence/server-domain';
import { FileWorkspaceLogicalEntities } from './workspace-logical-entities';
import { FileWorkspaceLogicalRelationships } from './workspace-logical-relationships';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('FileWorkspaceLogicalRelationships', () => {
  it('creates, updates, lists, and deletes association YAML', async () => {
    const evidenceRoot = await evidenceDirectory();
    const entities = new FileWorkspaceLogicalEntities(
      'workspace-1',
      evidenceRoot,
    );
    const source = await entities.add(entityDescription('Contract'));
    const target = await entities.add(entityDescription('Delivery Request'));
    const relationships = new FileWorkspaceLogicalRelationships(
      'workspace-1',
      evidenceRoot,
    );

    const created = await relationships.add(
      relationshipDescription(source.identity(), target.identity(), 'Triggers'),
    );

    expect(created.identity()).toBe('triggers');
    expect(created.description().source.id()).toBe(source.identity());
    const path = join(evidenceRoot, 'associations', 'triggers.yaml');
    expect(await readFile(path, 'utf8')).toContain(
      'relationshipType: relates_to',
    );

    const updated = await relationships.update(
      created.identity(),
      relationshipDescription(source.identity(), target.identity(), 'Confirms'),
    );
    expect(updated.description().label).toBe('Confirms');
    expect(await readFile(path, 'utf8')).toContain('label: Confirms');

    const [listed, total] = await relationships.list(1, 10);
    expect(total).toBe(1);
    expect(listed[0]?.identity()).toBe(created.identity());

    await relationships.delete(created.identity());
    await expect(
      relationships.findByIdentity(created.identity()),
    ).resolves.toBeNull();
  });

  it('rejects endpoints outside the workspace model', async () => {
    const evidenceRoot = await evidenceDirectory();
    const relationships = new FileWorkspaceLogicalRelationships(
      'workspace-1',
      evidenceRoot,
    );

    await expect(
      relationships.add(
        relationshipDescription('missing-source', 'missing-target', 'Invalid'),
      ),
    ).rejects.toMatchObject({ kind: 'validation' });
  });
});

function entityDescription(name: string): LogicalEntityDescription {
  return {
    workspace: new Ref('workspace-1'),
    type: 'EVIDENCE',
    subType: 'contract',
    name,
    label: name,
    description: null,
    attributes: [],
    createdAt: '',
    updatedAt: '',
  };
}

function relationshipDescription(
  source: string,
  target: string,
  label: string,
): LogicalRelationshipDescription {
  return {
    workspace: new Ref('workspace-1'),
    source: new Ref(source),
    target: new Ref(target),
    label,
  };
}

async function evidenceDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-relationships-'));
  temporaryPaths.push(root);
  const evidenceRoot = join(root, '.evidence');
  await mkdir(join(evidenceRoot, 'entities'), { recursive: true });
  await mkdir(join(evidenceRoot, 'associations'), { recursive: true });
  return evidenceRoot;
}
