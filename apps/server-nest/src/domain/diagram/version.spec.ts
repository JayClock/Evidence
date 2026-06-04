import { describe, expect, it } from 'vitest';
import { Ref } from '../core';
import type { EdgeDescription } from './edge';
import type { NodeDescription } from './node';
import { DiagramVersion, type DiagramVersionDescription } from './version';

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

const edgeDescription: EdgeDescription = {
  diagram: new Ref('diagram-1'),
  source: new Ref('node-1'),
  target: new Ref('node-2'),
  logicalRelationship: new Ref('relationship-1'),
  sourceHandle: null,
  targetHandle: null,
  kind: 'default',
  style: {},
  data: {},
  animated: false,
  hidden: false,
  markerStart: null,
  markerEnd: null,
  pathOptions: {},
  interactionWidth: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const versionDescription: DiagramVersionDescription = {
  diagram: new Ref('diagram-1'),
  name: 'v1',
  snapshot: {
    nodes: [{ id: 'node-1', description: nodeDescription }],
    edges: [{ id: 'edge-1', description: edgeDescription }],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  createdAt: timestamp,
};

describe('DiagramVersion', () => {
  it('returns identity and description', () => {
    const version = new DiagramVersion('version-1', versionDescription);

    expect(version.identity()).toBe('version-1');
    expect(version.description()).toBe(versionDescription);
  });
});
