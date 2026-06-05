import { describe, expect, it } from 'vitest';
import { Ref } from '../core';
import { Member, type MemberDescription } from './member';

const timestamp = '2026-01-01T00:00:00Z';

const memberDescription: MemberDescription = {
  workspace: new Ref('workspace-1'),
  user: new Ref('user-1'),
  role: 'owner',
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('Member', () => {
  it('returns identity and description', () => {
    const member = new Member('member-1', memberDescription);

    expect(member.identity()).toBe('member-1');
    expect(member.description()).toBe(memberDescription);
  });
});
