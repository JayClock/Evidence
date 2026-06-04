import { Entity } from '../core';
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

  workspaces(): UserWorkspaces {
    return this.userWorkspaces;
  }
}
