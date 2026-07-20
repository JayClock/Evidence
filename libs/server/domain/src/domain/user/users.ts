import { Workspaces } from '../workspace';
import { User } from './user';
import { UserMemberships } from './user-memberships';

export const USERS = Symbol('USERS');

export interface Users {
  workspaces(): Workspaces;
  memberships(userId: string): UserMemberships;
  findByIdentity(userId: string): Promise<User | null>;
}
