import { describe, expect, it } from 'vitest';
import { Ref } from '../core';
import { DiagramEdge, type EdgeDescription } from './edge';

const timestamp = '2026-01-01T00:00:00Z';

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

describe('DiagramEdge', () => {
  it('returns identity and description', () => {
    const edge = new DiagramEdge('edge-1', edgeDescription);

    expect(edge.identity()).toBe('edge-1');
    expect(edge.description()).toBe(edgeDescription);
  });
});
