import {
  defaultViewport,
  Diagram,
  DiagramDescription,
  DiagramEdge,
  DiagramNode,
  DiagramSnapshot,
  DiagramVersion,
  EntityAttribute,
  LogicalEntity,
  LogicalEntityDescription,
  LogicalEntityType,
  LogicalRelationship,
  Member,
  Position,
  Ref,
  User,
  UserDescription,
  Workspace,
} from '../../domain';
import type {
  Diagram as DiagramRow,
  DiagramEdge as DiagramEdgeRow,
  DiagramNode as DiagramNodeRow,
  DiagramVersion as DiagramVersionRow,
  LogicalEntity as LogicalEntityRow,
  LogicalRelationship as LogicalRelationshipRow,
  User as UserRow,
  Workspace as WorkspaceRow,
  WorkspaceMember as WorkspaceMemberRow,
} from '@prisma/client';
import { PrismaDiagramEdges } from './diagram-edges';
import { PrismaDiagramNodes } from './diagram-nodes';
import { PrismaDiagramVersions } from './diagram-versions';
import type { PrismaStore } from './types';
import { PrismaUserWorkspaces } from './user-workspaces';
import { PrismaWorkspaceDiagrams } from './workspace-diagrams';
import { PrismaWorkspaceLogicalEntities } from './workspace-logical-entities';
import { PrismaWorkspaceLogicalRelationships } from './workspace-logical-relationships';
import { PrismaWorkspaceMembers } from './workspace-members';

export function toIso(value: Date): string {
  return value.toISOString();
}

export function assembleUser(store: PrismaStore, row: UserRow): User {
  const description: UserDescription = {
    name: row.name,
    email: row.email,
  };
  return new User(row.id, description, new PrismaUserWorkspaces(store, row.id));
}

export function assembleWorkspace(
  store: PrismaStore,
  row: WorkspaceRow,
): Workspace {
  return new Workspace(
    row.id,
    {
      title: row.title,
      description: row.description,
      status: row.status,
      metadata: stringRecord(row.metadata),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    },
    new PrismaWorkspaceMembers(store, row.id),
    new PrismaWorkspaceDiagrams(store, row.id),
    new PrismaWorkspaceLogicalEntities(store, row.id),
    new PrismaWorkspaceLogicalRelationships(store, row.id),
  );
}

export function assembleMember(row: WorkspaceMemberRow): Member {
  return new Member(row.id, {
    workspace: new Ref(row.workspaceId),
    user: new Ref(row.userId),
    role: row.role,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

export function assembleDiagram(store: PrismaStore, row: DiagramRow): Diagram {
  const description: DiagramDescription = {
    workspace: new Ref(row.workspaceId),
    title: row.title,
    type: row.type as DiagramDescription['type'],
    viewport: viewport(row.viewport),
    status: row.status as DiagramDescription['status'],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
  return new Diagram(
    row.id,
    description,
    new PrismaDiagramNodes(store, row.id),
    new PrismaDiagramEdges(store, row.id),
    new PrismaDiagramVersions(store, row.id),
  );
}

export function assembleDiagramNode(row: DiagramNodeRow): DiagramNode {
  return new DiagramNode(row.id, {
    diagram: new Ref(row.diagramId),
    kind: row.kind,
    logicalEntity: row.logicalEntityId ? new Ref(row.logicalEntityId) : null,
    parent: row.parentId ? new Ref(row.parentId) : null,
    position: position(row.position),
    width: row.width,
    height: row.height,
    data: jsonObject(row.data),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

export function assembleDiagramEdge(row: DiagramEdgeRow): DiagramEdge {
  return new DiagramEdge(row.id, {
    diagram: new Ref(row.diagramId),
    source: new Ref(row.sourceId),
    target: new Ref(row.targetId),
    logicalRelationship: row.logicalRelationshipId
      ? new Ref(row.logicalRelationshipId)
      : null,
    sourceHandle: row.sourceHandle,
    targetHandle: row.targetHandle,
    kind: row.kind,
    style: jsonObject(row.style),
    data: jsonObject(row.data),
    animated: row.animated,
    hidden: row.hidden,
    markerStart: row.markerStart ? jsonObject(row.markerStart) : null,
    markerEnd: row.markerEnd ? jsonObject(row.markerEnd) : null,
    pathOptions: jsonObject(row.pathOptions),
    interactionWidth: row.interactionWidth,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

export function assembleDiagramVersion(row: DiagramVersionRow): DiagramVersion {
  return new DiagramVersion(row.id, {
    diagram: new Ref(row.diagramId),
    name: row.name,
    snapshot: row.snapshot as unknown as DiagramSnapshot,
    createdAt: toIso(row.createdAt),
  });
}

export function assembleLogicalEntity(row: LogicalEntityRow): LogicalEntity {
  const description: LogicalEntityDescription = {
    workspace: new Ref(row.workspaceId),
    type: row.type as LogicalEntityType,
    subType: row.subType,
    name: row.name,
    label: row.label,
    description: row.description,
    attributes: attributes(row.attributes),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
  return new LogicalEntity(row.id, description);
}

export function assembleLogicalRelationship(
  row: LogicalRelationshipRow,
): LogicalRelationship {
  return new LogicalRelationship(row.id, {
    workspace: new Ref(row.workspaceId),
    source: new Ref(row.sourceId),
    target: new Ref(row.targetId),
    label: row.label,
  });
}

export function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringRecord(value: unknown): Record<string, string> {
  const object = jsonObject(value);
  return Object.fromEntries(
    Object.entries(object).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string';
    }),
  );
}

function viewport(value: unknown): DiagramDescription['viewport'] {
  const object = jsonObject(value);
  return {
    ...defaultViewport(),
    ...object,
  } as DiagramDescription['viewport'];
}

function position(value: unknown): Position {
  const object = jsonObject(value);
  return { x: Number(object.x ?? 0), y: Number(object.y ?? 0) };
}

function attributes(value: unknown): EntityAttribute[] {
  return Array.isArray(value) ? (value as EntityAttribute[]) : [];
}
