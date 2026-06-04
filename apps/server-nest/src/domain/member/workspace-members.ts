import { HasMany } from '../core';
import { Member, MemberDescription } from './member';

export interface WorkspaceMembers extends HasMany<Member> {
  addMember(desc: MemberDescription): Promise<Member>;
  removeMember(userId: string): Promise<void>;
}
