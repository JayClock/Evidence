import { Injectable } from '@nestjs/common';
import { UserWorkspaces, Users } from '@evidence/server-nest-domain';
import { assembleSqliteUser, type SqliteUserRow } from './sqlite-mappers';
import { SqliteRegistry } from './sqlite-registry';
import { SqliteUserWorkspaces } from './sqlite-user-workspaces';

@Injectable()
export class SqliteUsers implements Users {
  constructor(private readonly registry: SqliteRegistry) {}

  workspaces(): UserWorkspaces {
    return new SqliteUserWorkspaces(this.registry, null);
  }

  async findByIdentity(userId: string) {
    const row = this.registry.database
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .get(userId) as SqliteUserRow | undefined;
    return row ? assembleSqliteUser(this.registry, row) : null;
  }
}
