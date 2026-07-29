import { Workspaces } from '../workspace';
import { User } from './user';
import { UserMemberships } from './user-memberships';

export const USERS = Symbol('USERS');

export interface ExternalUserIdentityKey {
  issuer: string;
  subject: string;
}

export interface ExternalUserIdentity extends ExternalUserIdentityKey {
  name: string;
  email: string | null;
}

export interface Users {
  workspaces(): Workspaces;
  memberships(userId: string): UserMemberships;
  findByIdentity(userId: string): Promise<User | null>;
  findByExternalIdentity(
    identity: ExternalUserIdentityKey,
  ): Promise<User | null>;
  provisionExternalIdentity(identity: ExternalUserIdentity): Promise<User>;
}
