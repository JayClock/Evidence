import { Entity, HasMany } from '../core';
import { Workspace, WorkspaceDescription } from '../workspace';
import { UserWorkspaces } from './user-workspaces';

export interface UserDescription {
  name: string;
  email: string | null;
}

export class User implements Entity<string, UserDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: UserDescription,
    private readonly userWorkspaces: UserWorkspaces,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): UserDescription {
    return this.desc;
  }

  workspaces(): HasMany<Workspace> {
    return this.userWorkspaces;
  }

  createWorkspace(desc: WorkspaceDescription): Promise<Workspace> {
    return this.userWorkspaces.create(desc);
  }

  updateWorkspace(id: string, desc: WorkspaceDescription): Promise<Workspace> {
    return this.userWorkspaces.update(id, desc);
  }

  deleteWorkspace(id: string): Promise<void> {
    return this.userWorkspaces.delete(id);
  }

  listWorkspaces(
    page: number,
    pageSize: number,
    query: string | null,
  ): Promise<[Workspace[], number]> {
    return this.userWorkspaces.list(page, pageSize, query);
  }
}
