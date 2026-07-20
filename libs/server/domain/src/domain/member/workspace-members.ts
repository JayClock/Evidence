import { HasMany } from '../core';
import { Member, MemberDescription } from './member';

export interface WorkspaceMembers extends HasMany<Member> {
  addMember(desc: MemberDescription): Promise<Member>;
  updateMember(memberId: string, role: string): Promise<Member>;
  removeMember(memberId: string): Promise<void>;
}
