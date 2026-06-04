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

  workspaceId(): string {
    return this.desc.workspace.id();
  }

  description(): MemberDescription {
    return this.desc;
  }

  createdAt(): string {
    return this.desc.createdAt;
  }

  updatedAt(): string {
    return this.desc.updatedAt;
  }
}
