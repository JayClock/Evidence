import type {
  DiagramDescription,
  EdgeDescription,
  LogicalEntityDescription,
  LogicalRelationshipDescription,
  NodeDescription,
  DiagramSnapshot,
} from '../domain';

export interface UserRecord {
  id: string;
  name: string;
  email: string | null;
}

export interface WorkspaceRecord {
  id: string;
  title: string;
  description: string | null;
  status: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MemberRecord {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramRecord {
  id: string;
  workspaceId: string;
  description: DiagramDescription;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DiagramNodeRecord {
  id: string;
  diagramId: string;
  description: NodeDescription;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramEdgeRecord {
  id: string;
  diagramId: string;
  description: EdgeDescription;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramVersionRecord {
  id: string;
  diagramId: string;
  name: string;
  snapshot: DiagramSnapshot;
  createdAt: string;
}

export interface LogicalEntityRecord {
  id: string;
  workspaceId: string;
  description: LogicalEntityDescription;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LogicalRelationshipRecord {
  id: string;
  workspaceId: string;
  description: LogicalRelationshipDescription;
  deletedAt: string | null;
}

export class InMemoryStore {
  readonly users = new Map<string, UserRecord>();
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly members = new Map<string, MemberRecord>();
  readonly diagrams = new Map<string, DiagramRecord>();
  readonly diagramNodes = new Map<string, DiagramNodeRecord>();
  readonly diagramEdges = new Map<string, DiagramEdgeRecord>();
  readonly diagramVersions = new Map<string, DiagramVersionRecord>();
  readonly logicalEntities = new Map<string, LogicalEntityRecord>();
  readonly logicalRelationships = new Map<string, LogicalRelationshipRecord>();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const timestamp = now();
    const userId = 'desktop-user';
    const workspaceId = 'default-workspace';
    const memberId = 'default-workspace-owner';

    this.users.set(userId, {
      id: userId,
      name: 'Desktop User',
      email: 'desktop@evidence.local',
    });
    this.workspaces.set(workspaceId, {
      id: workspaceId,
      title: 'Default Workspace',
      description: 'Seed workspace for local desktop usage',
      status: 'active',
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
    this.members.set(memberId, {
      id: memberId,
      workspaceId,
      userId,
      role: 'owner',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

export function now(): string {
  return new Date().toISOString();
}

export function defaultIfBlank(value: string, defaultValue: string): string {
  const normalized = value.trim();
  return normalized.length === 0 ? defaultValue : normalized;
}
