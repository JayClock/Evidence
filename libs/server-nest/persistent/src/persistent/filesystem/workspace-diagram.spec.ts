import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileWorkspaceDiagram } from './workspace-diagram';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('FileWorkspaceDiagram', () => {
  it('projects entity and association YAML as one diagram graph', async () => {
    const evidenceRoot = await evidenceDirectory();
    await writeFile(
      join(evidenceRoot, 'entities', 'contract.yaml'),
      [
        'id: contract',
        'name: Contract',
        'label: Contract',
        'type: EVIDENCE',
        'subType: contract',
        'parent: commerce',
        'description: |',
        '  Signed agreement',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(evidenceRoot, 'entities', 'commerce.yaml'),
      [
        'id: commerce',
        'name: Commerce',
        'label: Business Context',
        'type: CONTEXT',
        'subType: bounded_context',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(evidenceRoot, 'associations', 'contains.yaml'),
      [
        'id: commerce_contains_contract',
        'kind: association',
        'name: CommerceContainsContract',
        'label: Contains',
        'source: commerce',
        'target: contract',
        'relationshipType: contains',
        'direction: directed',
        'cardinality: one-to-many',
        '',
      ].join('\n'),
    );

    const diagram = await new FileWorkspaceDiagram(
      'workspace-1',
      evidenceRoot,
    ).get();
    const nodes = await diagram.nodes().findAll().toArray();
    const edges = await diagram.edges().findAll().toArray();

    expect(diagram.identity()).toBe('model');
    expect(diagram.description().workspace.id()).toBe('workspace-1');
    expect(nodes.map((node) => node.identity())).toEqual([
      'commerce',
      'contract',
    ]);
    expect(nodes[0]?.description()).toMatchObject({
      kind: 'group-container',
      position: { x: 120, y: 120 },
    });
    expect(nodes[1]?.description()).toMatchObject({
      kind: 'fulfillment-node',
      position: { x: 360, y: 120 },
      data: {
        type: 'EVIDENCE',
        subType: 'contract',
        content: 'Signed agreement\n',
      },
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]?.description()).toMatchObject({
      animated: true,
      data: {
        relationType: 'contains',
        cardinality: 'one-to-many',
      },
    });
    expect(edges[0]?.description().source.id()).toBe('commerce');
    expect(edges[0]?.description().target.id()).toBe('contract');
  });

  it('reports invalid model YAML as a validation error', async () => {
    const evidenceRoot = await evidenceDirectory();
    await writeFile(
      join(evidenceRoot, 'entities', 'invalid.yaml'),
      'name: MissingIdentity\ntype: EVIDENCE\n',
    );
    const diagram = await new FileWorkspaceDiagram(
      'workspace-1',
      evidenceRoot,
    ).get();

    await expect(diagram.nodes().findAll().toArray()).rejects.toMatchObject({
      kind: 'validation',
    });
  });
});

async function evidenceDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-model-'));
  temporaryPaths.push(root);
  const evidenceRoot = join(root, '.evidence');
  await mkdir(join(evidenceRoot, 'entities'), { recursive: true });
  await mkdir(join(evidenceRoot, 'associations'), { recursive: true });
  return evidenceRoot;
}
