import { Injectable } from '@nestjs/common';
import { User, UserDescription, Users, UserWorkspaces } from '../domain';
import { InMemoryUserWorkspaces } from './in-memory-user-workspaces';
import { InMemoryStore, UserRecord } from './records';

@Injectable()
export class InMemoryUsers implements Users {
  private readonly store = new InMemoryStore();
  private readonly allWorkspaces = new InMemoryUserWorkspaces(this.store, null);

  workspaces(): UserWorkspaces {
    return this.allWorkspaces;
  }

  async findByIdentity(userId: string): Promise<User | null> {
    const record = this.store.users.get(userId);
    return record ? this.assemble(record) : null;
  }

  private assemble(record: UserRecord): User {
    const description: UserDescription = {
      name: record.name,
      email: record.email,
    };
    return new User(
      record.id,
      description,
      new InMemoryUserWorkspaces(this.store, record.id),
    );
  }
}
