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

export class InMemoryStore {
  readonly users = new Map<string, UserRecord>();
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly members = new Map<string, MemberRecord>();

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
