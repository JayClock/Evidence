import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createFixtureDocument } from '../../tests/support/fixtureModel.js';
import { relationshipEdgeId } from './domainToLayoutTree.js';
import type { LayoutTreeNode } from './layoutTree.js';
import { layoutTreeToGraph } from './layoutTreeToGraph.js';

const relationshipId = 'relation.confirmation-references-request';
const graph = createDomainGraph(createFixtureDocument());
const rootOf = (): LayoutTreeNode => ({
  id: 'root',
  width: 800,
  height: 600,
  children: [
    {
      id: 'context.product-sourcing',
      x: 20,
      y: 30,
      width: 700,
      height: 500,
      children: [
        {
          id: 'context.product-procurement',
          x: 40,
          y: 60,
          width: 600,
          height: 400,
          children: [
            {
              id: 'evidence.delivery-request',
              x: 10,
              y: 20,
              width: 100,
              height: 60,
            },
            {
              id: 'evidence.delivery-confirmation',
              x: 200,
              y: 20,
              width: 100,
              height: 60,
            },
          ],
          edges: [
            {
              id: relationshipEdgeId(relationshipId),
              sourceId: 'evidence.delivery-confirmation',
              targetId: 'evidence.delivery-request',
              points: [
                { x: 200, y: 50 },
                { x: 150, y: 50 },
                { x: 150, y: 50 },
                { x: 110, y: 50 },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('journey tree extraction', () => {
  it('preserves local boxes, offsets world geometry and removes duplicate route points', () => {
    const result = layoutTreeToGraph(rootOf(), graph);
    expect(result.nodeById.get('evidence.delivery-request')).toMatchObject({
      box: { x: 10, y: 20 },
      worldBox: { x: 70, y: 110 },
      contextId: 'context.product-procurement',
    });
    expect(
      result.contextGroupById.get('context.product-procurement'),
    ).toMatchObject({
      box: { x: 40, y: 60 },
      worldBox: { x: 60, y: 90 },
      depth: 1,
      parentContextId: 'context.product-sourcing',
    });
    expect(result.edgeById.get(relationshipId)?.points).toEqual([
      { x: 260, y: 140 },
      { x: 210, y: 140 },
      { x: 170, y: 140 },
    ]);
  });

  it('rejects missing routes rather than inventing geometry', () => {
    const root = rootOf();
    delete root.children![0]!.children![0]!.edges![0]!.points;
    expect(() => layoutTreeToGraph(root, graph)).toThrow(
      'Journey route is missing',
    );
  });
});
