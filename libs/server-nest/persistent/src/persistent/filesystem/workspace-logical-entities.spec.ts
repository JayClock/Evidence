import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Ref,
  type LogicalEntityDescription,
} from '@evidence/server-nest-domain';
import { FileWorkspaceLogicalEntities } from './workspace-logical-entities';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('FileWorkspaceLogicalEntities', () => {
  it('creates, updates, lists, and deletes logical entity YAML', async () => {
    const evidenceRoot = await evidenceDirectory();
    const entities = new FileWorkspaceLogicalEntities(
      'workspace-1',
      evidenceRoot,
    );

    const created = await entities.add(
      description({ name: 'Sales Contract', subType: 'EVIDENCE:contract' }),
    );

    expect(created.identity()).toBe('sales_contract');
    expect(created.description()).toMatchObject({
      type: 'EVIDENCE',
      subType: 'contract',
      name: 'Sales Contract',
    });
    expect(
      await readFile(
        join(evidenceRoot, 'entities', 'sales_contract.yaml'),
        'utf8',
      ),
    ).toContain('subType: contract');

    const updated = await entities.update(
      created.identity(),
      description({
        type: 'PARTICIPANT',
        subType: 'party',
        name: 'Customer',
        description: 'Contract customer',
      }),
    );
    expect(updated.identity()).toBe(created.identity());
    expect(updated.description()).toMatchObject({
      type: 'PARTICIPANT',
      subType: 'party',
      name: 'Customer',
      description: 'Contract customer',
    });

    const [listed, total] = await entities.list(1, 10);
    expect(total).toBe(1);
    expect(listed[0]?.identity()).toBe(created.identity());

    await entities.delete(created.identity());
    await expect(
      entities.findByIdentity(created.identity()),
    ).resolves.toBeNull();
  });

  it('preserves parent metadata when updating an existing entity', async () => {
    const evidenceRoot = await evidenceDirectory();
    const path = join(evidenceRoot, 'entities', 'contract.yaml');
    await writeFile(
      path,
      'id: contract\nname: Contract\ntype: EVIDENCE\nsubType: contract\nparent: commerce\n',
    );
    const entities = new FileWorkspaceLogicalEntities(
      'workspace-1',
      evidenceRoot,
    );

    await entities.update('contract', description({ name: 'Agreement' }));

    expect(await readFile(path, 'utf8')).toContain('parent: commerce');
  });

  it('rejects invalid pages and missing entity names', async () => {
    const evidenceRoot = await evidenceDirectory();
    const entities = new FileWorkspaceLogicalEntities(
      'workspace-1',
      evidenceRoot,
    );

    await expect(entities.list(0, 10)).rejects.toMatchObject({
      kind: 'validation',
    });
    await expect(
      entities.add(description({ name: '  ' })),
    ).rejects.toMatchObject({ kind: 'validation' });
  });
});

function description(
  overrides: Partial<LogicalEntityDescription> = {},
): LogicalEntityDescription {
  return {
    workspace: new Ref('workspace-1'),
    type: 'EVIDENCE',
    subType: 'contract',
    name: 'Contract',
    label: 'Contract',
    description: 'Signed agreement',
    attributes: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

async function evidenceDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-entities-'));
  temporaryPaths.push(root);
  const evidenceRoot = join(root, '.evidence');
  await mkdir(join(evidenceRoot, 'entities'), { recursive: true });
  return evidenceRoot;
}
