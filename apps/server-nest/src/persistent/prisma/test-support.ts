import { vi } from 'vitest';
import {
  Ref,
  type DiagramDescription,
  type DiagramVersionDescription,
  type EdgeDescription,
  type LogicalEntityDescription,
  type LogicalRelationshipDescription,
  type MemberDescription,
  type NodeDescription,
  type WorkspaceDescription,
} from '../../domain';
import type { PrismaStore } from './types';

export const timestamp = new Date('2026-01-01T00:00:00.000Z');
export const isoTimestamp = timestamp.toISOString();

export type MockFn = ReturnType<typeof vi.fn>;

export interface MockPrismaStore {
  user: Record<string, MockFn>;
  workspace: Record<string, MockFn>;
  workspaceMember: Record<string, MockFn>;
  diagram: Record<string, MockFn>;
  diagramNode: Record<string, MockFn>;
  diagramEdge: Record<string, MockFn>;
  diagramVersion: Record<string, MockFn>;
  logicalEntity: Record<string, MockFn>;
  logicalRelationship: Record<string, MockFn>;
  $transaction: MockFn;
}

export function asStore(store: MockPrismaStore): PrismaStore {
  return store as unknown as PrismaStore;
}

export function mockPrismaStore(): MockPrismaStore {
  const store = {
    user: delegate(['findUnique', 'upsert']),
    workspace: delegate(['findMany', 'findFirst', 'count', 'create', 'update']),
    workspaceMember: delegate([
      'findMany',
      'findFirst',
      'count',
      'create',
      'delete',
      'upsert',
    ]),
    diagram: delegate(['findMany', 'findFirst', 'count', 'create', 'update']),
    diagramNode: delegate([
      'findMany',
      'findFirst',
      'count',
      'create',
      'createMany',
      'update',
      'delete',
      'deleteMany',
    ]),
    diagramEdge: delegate([
      'findMany',
      'findFirst',
      'count',
      'create',
      'createMany',
      'update',
      'delete',
      'deleteMany',
    ]),
    diagramVersion: delegate(['findMany', 'findFirst', 'count', 'create']),
    logicalEntity: delegate([
      'findMany',
      'findFirst',
      'count',
      'create',
      'update',
    ]),
    logicalRelationship: delegate([
      'findMany',
      'findFirst',
      'count',
      'create',
      'update',
    ]),
    $transaction: vi.fn(),
  } satisfies MockPrismaStore;

  store.$transaction.mockImplementation(
    async (callback: (tx: PrismaStore) => Promise<unknown>) =>
      callback(asStore(store)),
  );

  return store;
}

function delegate(methods: string[]): Record<string, MockFn> {
  return Object.fromEntries(methods.map((method) => [method, vi.fn()]));
}

export function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Desktop User',
    email: 'desktop@example.com',
    ...overrides,
  };
}

export function workspaceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workspace-1',
    title: 'Default Workspace',
    description: 'Seed workspace',
    status: 'active',
    metadata: { source: 'test' },
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

export function workspaceDescription(
  overrides: Partial<WorkspaceDescription> = {},
): WorkspaceDescription {
  return {
    title: 'Default Workspace',
    description: 'Seed workspace',
    status: 'active',
    metadata: { source: 'test' },
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    ...overrides,
  };
}

export function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    role: 'owner',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function memberDescription(
  overrides: Partial<MemberDescription> = {},
): MemberDescription {
  return {
    workspace: new Ref('workspace-1'),
    user: new Ref('user-1'),
    role: 'owner',
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    ...overrides,
  };
}

export function diagramRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'diagram-1',
    workspaceId: 'workspace-1',
    title: 'Fulfillment',
    type: 'flowchart',
    viewport: { x: 0, y: 0, zoom: 1 },
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

export function diagramDescription(
  overrides: Partial<DiagramDescription> = {},
): DiagramDescription {
  return {
    workspace: new Ref('workspace-1'),
    title: 'Fulfillment',
    type: 'flowchart',
    viewport: { x: 0, y: 0, zoom: 1 },
    status: 'draft',
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    ...overrides,
  };
}

export function nodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-1',
    diagramId: 'diagram-1',
    kind: 'default',
    logicalEntityId: 'entity-1',
    parentId: null,
    position: { x: 100, y: 200 },
    width: 320,
    height: 120,
    data: { label: 'RFP' },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function nodeDescription(
  overrides: Partial<NodeDescription> = {},
): NodeDescription {
  return {
    diagram: new Ref('diagram-1'),
    kind: 'default',
    logicalEntity: new Ref('entity-1'),
    parent: null,
    position: { x: 100, y: 200 },
    width: 320,
    height: 120,
    data: { label: 'RFP' },
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    ...overrides,
  };
}

export function edgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'edge-1',
    diagramId: 'diagram-1',
    sourceId: 'node-1',
    targetId: 'node-2',
    logicalRelationshipId: 'relationship-1',
    sourceHandle: 'source',
    targetHandle: 'target',
    kind: 'default',
    style: { stroke: '#111827' },
    data: { label: 'fulfills' },
    animated: false,
    hidden: false,
    markerStart: null,
    markerEnd: { type: 'arrowclosed' },
    pathOptions: {},
    interactionWidth: 20,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function edgeDescription(
  overrides: Partial<EdgeDescription> = {},
): EdgeDescription {
  return {
    diagram: new Ref('diagram-1'),
    source: new Ref('node-1'),
    target: new Ref('node-2'),
    logicalRelationship: new Ref('relationship-1'),
    sourceHandle: 'source',
    targetHandle: 'target',
    kind: 'default',
    style: { stroke: '#111827' },
    data: { label: 'fulfills' },
    animated: false,
    hidden: false,
    markerStart: null,
    markerEnd: { type: 'arrowclosed' },
    pathOptions: {},
    interactionWidth: 20,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    ...overrides,
  };
}

export function versionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-1',
    diagramId: 'diagram-1',
    name: 'v1',
    snapshot: diagramVersionDescription().snapshot,
    createdAt: timestamp,
    ...overrides,
  };
}

export function diagramVersionDescription(
  overrides: Partial<DiagramVersionDescription> = {},
): DiagramVersionDescription {
  return {
    diagram: new Ref('diagram-1'),
    name: 'v1',
    snapshot: {
      nodes: [{ id: 'node-1', description: nodeDescription() }],
      edges: [{ id: 'edge-1', description: edgeDescription() }],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    createdAt: isoTimestamp,
    ...overrides,
  };
}

export function logicalEntityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entity-1',
    workspaceId: 'workspace-1',
    type: 'EVIDENCE',
    subType: 'rfp',
    name: 'RFP',
    label: 'RFP',
    description: 'Request for proposal',
    attributes: [{ id: 'attribute-1', name: 'number' }],
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

export function logicalEntityDescription(
  overrides: Partial<LogicalEntityDescription> = {},
): LogicalEntityDescription {
  return {
    workspace: new Ref('workspace-1'),
    type: 'EVIDENCE',
    subType: 'rfp',
    name: 'RFP',
    label: 'RFP',
    description: 'Request for proposal',
    attributes: [{ id: 'attribute-1', name: 'number' }],
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    ...overrides,
  };
}

export function logicalRelationshipRow(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'relationship-1',
    workspaceId: 'workspace-1',
    sourceId: 'entity-1',
    targetId: 'entity-2',
    label: 'fulfills',
    deletedAt: null,
    ...overrides,
  };
}

export function logicalRelationshipDescription(
  overrides: Partial<LogicalRelationshipDescription> = {},
): LogicalRelationshipDescription {
  return {
    workspace: new Ref('workspace-1'),
    source: new Ref('entity-1'),
    target: new Ref('entity-2'),
    label: 'fulfills',
    ...overrides,
  };
}
