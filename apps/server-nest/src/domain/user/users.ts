import { User } from './user';
import { UserWorkspaces } from './user-workspaces';

export const USERS = Symbol('USERS');

export interface Users {
  workspaces(): UserWorkspaces;
  findByIdentity(userId: string): Promise<User | null>;
}
