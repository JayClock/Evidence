import { Entity, Ref } from '../core';

export interface MemberDescription {
  workspace: Ref<string>;
  user: Ref<string>;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export class Member implements Entity<string, MemberDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: MemberDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): MemberDescription {
    return this.desc;
  }
}
