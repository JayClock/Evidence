import { Injectable } from '@nestjs/common';
import {
  UserMemberships,
  Users,
  Workspaces,
} from '@evidence/server-domain';
import { assembleSqliteUser, type SqliteUserRow } from './sqlite-mappers';
import { SqliteRegistry } from './sqlite-registry';
import { SqliteUserMemberships } from './sqlite-user-memberships';
import { SqliteWorkspaces } from './sqlite-workspaces';

@Injectable()
export class SqliteUsers implements Users {
  constructor(private readonly registry: SqliteRegistry) {}

  workspaces(): Workspaces {
    return new SqliteWorkspaces(this.registry);
  }

  memberships(userId: string): UserMemberships {
    return new SqliteUserMemberships(this.registry, userId);
  }

  async findByIdentity(userId: string) {
    const row = this.registry.database
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .get(userId) as SqliteUserRow | undefined;
    return row ? assembleSqliteUser(this.registry, row) : null;
  }
}
