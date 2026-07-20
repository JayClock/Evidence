import { describe, expect, it } from 'vitest';
import { Ref } from '../core';
import { DiagramNode, type NodeDescription } from './node';

const timestamp = '2026-01-01T00:00:00Z';

const nodeDescription: NodeDescription = {
  diagram: new Ref('diagram-1'),
  kind: 'default',
  logicalEntity: new Ref('entity-1'),
  parent: null,
  position: { x: 100, y: 200 },
  width: 320,
  height: 120,
  data: { label: 'RFP' },
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('DiagramNode', () => {
  it('returns identity and description', () => {
    const node = new DiagramNode('node-1', nodeDescription);

    expect(node.identity()).toBe('node-1');
    expect(node.description()).toBe(nodeDescription);
  });
});
