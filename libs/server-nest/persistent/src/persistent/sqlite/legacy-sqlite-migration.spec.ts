import { createRequire } from 'node:module';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteRegistry, type SqliteDatabase } from './sqlite-registry';
import { SqliteUsers } from './sqlite-users';

interface DatabaseSyncConstructor {
  new (path: string): SqliteDatabase;
}

const nodeRequire = createRequire(__filename);
const DatabaseSync = (
  nodeRequire('node:sqlite') as { DatabaseSync: DatabaseSyncConstructor }
).DatabaseSync;
let testRoot: string | null = null;
let registry: SqliteRegistry | null = null;

afterEach(async () => {
  registry?.close();
  registry = null;
  vi.unstubAllEnvs();
  if (testRoot) {
    await rm(testRoot, { recursive: true, force: true });
    testRoot = null;
  }
});

describe('legacy Tauri SQLite migration', () => {
  it('backs up and imports registry and model data exactly once', async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'evidence-legacy-sqlite-'));
    const sourcePath = join(testRoot, 'tauri', 'evidence.sqlite');
    const targetPath = join(testRoot, 'electron', 'registry.sqlite');
    const projectRoot = join(testRoot, 'legacy-project');
    const defaultWorkspacePath = join(
      testRoot,
      'electron',
      'default-workspace',
    );
    await Promise.all([
      mkdir(join(testRoot, 'tauri'), { recursive: true }),
      mkdir(projectRoot, { recursive: true }),
    ]);
    createLegacyDatabase(sourcePath, projectRoot);
    vi.stubEnv('EVIDENCE_LEGACY_REGISTRY_PATH', sourcePath);
    vi.stubEnv('EVIDENCE_DEFAULT_WORKSPACE_PATH', defaultWorkspacePath);

    registry = new SqliteRegistry(targetPath);
    await registry.open();

    const user = await new SqliteUsers(registry).findByIdentity('legacy-user');
    const workspace = await user
      ?.workspaces()
      .findByIdentity('legacy-workspace');
    expect(workspace?.description()).toMatchObject({
      title: 'Legacy Workspace',
      metadata: {
        repositoryRoot: await realpath(projectRoot),
        evidenceRoot: join(await realpath(projectRoot), '.evidence'),
      },
    });
    expect(await workspace?.members().findAll().toArray()).toHaveLength(1);

    const entityYaml = await readFile(
      join(projectRoot, '.evidence', 'entities', 'order.yaml'),
      'utf8',
    );
    expect(entityYaml).toContain('id: order');
    expect(entityYaml).toContain('description: A customer order');
    const relationshipYaml = await readFile(
      join(projectRoot, '.evidence', 'associations', 'order_customer.yaml'),
      'utf8',
    );
    expect(relationshipYaml).toContain('source: order');
    expect(relationshipYaml).toContain('target: customer');

    const markerPath = join(testRoot, 'electron', 'legacy-migration.json');
    const manifest = JSON.parse(await readFile(markerPath, 'utf8')) as {
      source: { counts: Record<string, number>; sha256: string };
      target: { counts: Record<string, number> };
      backupPaths: string[];
      modelHashes: Record<string, string>;
    };
    expect(manifest.source.counts).toMatchObject({
      users: 1,
      workspaces: 1,
      members: 1,
      logicalEntities: 2,
      logicalRelationships: 1,
    });
    expect(manifest.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.target.counts).toEqual({
      users: 1,
      workspaces: 1,
      members: 1,
    });
    expect(manifest.backupPaths).toHaveLength(1);
    expect(manifest.modelHashes['legacy-workspace']).toMatch(/^[a-f0-9]{64}$/);
    await access(manifest.backupPaths[0] ?? 'missing');

    registry.close();
    registry = new SqliteRegistry(targetPath);
    await registry.open();
    expect(
      await readdir(join(testRoot, 'electron', 'legacy-backups')),
    ).toHaveLength(1);
  });
});

function createLegacyDatabase(path: string, projectRoot: string): void {
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT
    );
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE logical_entities (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      type TEXT NOT NULL,
      sub_type TEXT,
      name TEXT NOT NULL,
      label TEXT,
      definition TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE logical_relationships (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      label TEXT,
      deleted_at TEXT
    );
  `);
  const timestamp = '2026-05-26T12:00:00Z';
  database
    .prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)')
    .run('legacy-user', 'Legacy User', 'legacy@example.com');
  database
    .prepare(
      `INSERT INTO workspaces
        (id, title, description, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'legacy-workspace',
      'Legacy Workspace',
      'Imported from Tauri',
      'active',
      JSON.stringify({ repositoryRoot: projectRoot }),
      timestamp,
      timestamp,
    );
  database
    .prepare(
      `INSERT INTO members
        (id, workspace_id, user_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'legacy-owner',
      'legacy-workspace',
      'legacy-user',
      'owner',
      timestamp,
      timestamp,
    );

  const insertEntity = database.prepare(
    `INSERT INTO logical_entities
      (id, workspace_id, type, sub_type, name, label, definition,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertEntity.run(
    'order',
    'legacy-workspace',
    'EVIDENCE',
    'EVIDENCE:other_evidence',
    'Order',
    null,
    JSON.stringify({ description: 'A customer order', attributes: [] }),
    timestamp,
    timestamp,
  );
  insertEntity.run(
    'customer',
    'legacy-workspace',
    'PARTICIPANT',
    'PARTICIPANT:party',
    'Customer',
    null,
    '{}',
    timestamp,
    timestamp,
  );
  database
    .prepare(
      `INSERT INTO logical_relationships
        (id, workspace_id, source_id, target_id, label)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      'order_customer',
      'legacy-workspace',
      'order',
      'customer',
      'belongs to',
    );
  database.close();
}
