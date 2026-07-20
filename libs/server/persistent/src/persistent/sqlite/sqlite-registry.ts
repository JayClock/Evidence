import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { normalizeWorkspaceMetadata } from '../workspace-paths';
import { migrateLegacySqlite } from './legacy-sqlite-migration';

export const SQLITE_REGISTRY_PATH = Symbol('SQLITE_REGISTRY_PATH');

type SqlValue = string | number | bigint | Uint8Array | null;

export interface SqliteStatement {
  all(...parameters: SqlValue[]): unknown[];
  get(...parameters: SqlValue[]): unknown;
  run(...parameters: SqlValue[]): { changes: number | bigint };
}

export interface SqliteDatabase {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

interface DatabaseSyncConstructor {
  new (path: string): SqliteDatabase;
}

const nodeRequire = createRequire(__filename);

function databaseConstructor(): DatabaseSyncConstructor {
  const sqlite = nodeRequire('node:sqlite') as {
    DatabaseSync: DatabaseSyncConstructor;
  };
  return sqlite.DatabaseSync;
}

@Injectable()
export class SqliteRegistry implements OnModuleInit, OnModuleDestroy {
  private connection: SqliteDatabase | null = null;
  private readonly databasePath: string;

  constructor(
    @Optional()
    @Inject(SQLITE_REGISTRY_PATH)
    databasePath?: string,
  ) {
    this.databasePath =
      databasePath ??
      process.env.EVIDENCE_REGISTRY_PATH ??
      join(process.cwd(), '.evidence-data', 'registry.sqlite');
  }

  get database(): SqliteDatabase {
    if (!this.connection) {
      throw new Error('SQLite workspace registry has not been initialized.');
    }
    return this.connection;
  }

  async onModuleInit(): Promise<void> {
    await this.open();
  }

  onModuleDestroy(): void {
    this.close();
  }

  async open(): Promise<void> {
    if (this.connection) {
      return;
    }

    await mkdir(dirname(this.databasePath), { recursive: true });
    const DatabaseSync = databaseConstructor();
    this.connection = new DatabaseSync(this.databasePath);
    try {
      this.connection.exec(
        'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;',
      );
      this.initializeSchema();
      const defaultWorkspacePath = this.defaultWorkspacePath();
      const legacyDatabasePath =
        process.env.EVIDENCE_LEGACY_REGISTRY_PATH?.trim();
      if (legacyDatabasePath) {
        await migrateLegacySqlite({
          sourcePath: legacyDatabasePath,
          targetPath: this.databasePath,
          defaultWorkspacePath,
          target: this.connection,
        });
      }
      await this.seedDefaults(defaultWorkspacePath);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close(): void {
    this.connection?.close();
    this.connection = null;
  }

  transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private initializeSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS workspace_members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_workspaces_updated
        ON workspaces(deleted_at, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workspace_members_user
        ON workspace_members(user_id, workspace_id);
      PRAGMA user_version = 1;
    `);
  }

  private defaultWorkspacePath(): string {
    return (
      process.env.EVIDENCE_DEFAULT_WORKSPACE_PATH ??
      join(dirname(this.databasePath), 'default-workspace')
    );
  }

  private async seedDefaults(defaultRoot: string): Promise<void> {
    await mkdir(defaultRoot, { recursive: true });
    const metadata = await normalizeWorkspaceMetadata({}, defaultRoot);
    const timestamp = new Date().toISOString();

    this.transaction(() => {
      this.database
        .prepare(
          'INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)',
        )
        .run('desktop-user', 'Desktop User', 'desktop@evidence.local');
      this.database
        .prepare(
          `INSERT OR IGNORE INTO workspaces
            (id, title, description, status, metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'default-workspace',
          'Default Workspace',
          'Seed workspace for local desktop usage',
          'active',
          JSON.stringify(metadata),
          timestamp,
          timestamp,
        );
      this.database
        .prepare(
          `INSERT OR IGNORE INTO workspace_members
            (id, workspace_id, user_id, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'default-workspace-owner',
          'default-workspace',
          'desktop-user',
          'owner',
          timestamp,
          timestamp,
        );
    });
  }
}
