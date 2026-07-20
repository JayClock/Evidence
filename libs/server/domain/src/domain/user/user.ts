import { Entity } from '../core';

export interface UserDescription {
  name: string;
  email: string | null;
}

export class User implements Entity<string, UserDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: UserDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): UserDescription {
    return this.desc;
  }
}
