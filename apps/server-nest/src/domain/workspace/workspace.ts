import { Entity, HasMany } from '../core';
import { Member, WorkspaceMembers } from '../member';

export interface WorkspaceDescription {
  title: string;
  description: string | null;
  status: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export class Workspace implements Entity<string, WorkspaceDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: WorkspaceDescription,
    private readonly workspaceMembers: WorkspaceMembers,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): WorkspaceDescription {
    return this.desc;
  }

  members(): HasMany<Member> {
    return this.workspaceMembers;
  }

  membersWide(): WorkspaceMembers {
    return this.workspaceMembers;
  }
}
