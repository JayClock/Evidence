import { HasMany } from '../core';
import { Workspace, WorkspaceDescription } from './workspace';

export interface Workspaces extends HasMany<Workspace> {
  create(
    ownerUserId: string,
    description: WorkspaceDescription,
  ): Promise<Workspace>;
  update(id: string, description: WorkspaceDescription): Promise<Workspace>;
  delete(id: string): Promise<void>;
}
