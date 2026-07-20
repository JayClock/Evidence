import { HasMany } from '../core';
import { Workspace, WorkspaceDescription } from '../workspace';

export interface UserWorkspaces extends HasMany<Workspace> {
  list(
    page: number,
    pageSize: number,
    query: string | null,
  ): Promise<[Workspace[], number]>;
  create(desc: WorkspaceDescription): Promise<Workspace>;
  update(id: string, desc: WorkspaceDescription): Promise<Workspace>;
  delete(id: string): Promise<void>;
}
