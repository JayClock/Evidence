import type { Member } from '../member';
import type { Workspace } from '../workspace';

export interface MembershipView {
  member: Member;
  workspace: Workspace;
}

export interface UserMemberships {
  list(page: number, pageSize: number): Promise<[MembershipView[], number]>;
  findByWorkspaceIdentity(workspaceId: string): Promise<MembershipView | null>;
}
