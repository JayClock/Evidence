import { createHash } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { stringify } from 'yaml';
import { DomainError } from '@evidence/server-domain';
import { normalizeWorkspaceMetadata } from '../workspace-paths';
import type { SqliteDatabase } from './sqlite-registry';

const nodeRequire = createRequire(__filename);
const MIGRATION_VERSION = 1;

interface DatabaseSyncConstructor {
  new (path: string, options?: { readOnly?: boolean }): SqliteDatabase;
}

interface LegacyUserRow {
  id: string;
  name: string;
  email: string | null;
}

interface LegacyWorkspaceRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  metadata: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface LegacyMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
}

interface LegacyEntityRow {
  id: string;
  workspace_id: string;
  type: string;
  sub_type: string | null;
  name: string;
  label: string | null;
  definition: string;
  deleted_at: string | null;
}

interface LegacyRelationshipRow {
  id: string;
  workspace_id: string;
  source_id: string;
  target_id: string;
  label: string | null;
  deleted_at: string | null;
}

interface PreparedWorkspace extends LegacyWorkspaceRow {
  metadataObject: Record<string, string>;
}

export interface LegacySqliteMigrationManifest {
  version: number;
  source: {
    path: string;
    sha256: string;
    schema: 'seaorm-sqlite';
    counts: Record<string, number>;
  };
  target: {
    path: string;
    schema: 'sqlite-registry-v1';
    counts: Record<string, number>;
  };
  backupPaths: string[];
  modelHashes: Record<string, string>;
  skipped: string[];
  startedAt: string;
  completedAt: string;
  toolVersion: string;
}

export interface LegacySqliteMigrationOptions {
  sourcePath: string;
  targetPath: string;
  defaultWorkspacePath: string;
  target: SqliteDatabase;
}

export async function migrateLegacySqlite(
  options: LegacySqliteMigrationOptions,
): Promise<LegacySqliteMigrationManifest | null> {
  const sourcePath = resolve(options.sourcePath);
  const targetPath = resolve(options.targetPath);
  if (sourcePath === targetPath || !(await pathExists(sourcePath))) {
    return null;
  }

  const markerPath = migrationMarkerPath(targetPath);
  if (await pathExists(markerPath)) {
    return JSON.parse(
      await readFile(markerPath, 'utf8'),
    ) as LegacySqliteMigrationManifest;
  }

  const startedAt = new Date().toISOString();
  const backupPaths = await backupLegacyDatabase(sourcePath, targetPath);
  const DatabaseSync = databaseConstructor();
  const source = new DatabaseSync(sourcePath, { readOnly: true });

  try {
    const users = readUsers(source);
    const workspaces = await prepareWorkspaces(
      readWorkspaces(source),
      options.defaultWorkspacePath,
    );
    const members = readMembers(source);
    const entities = readEntities(source);
    const relationships = readRelationships(source);
    validateRegistryRows(users, workspaces, members);
    validateModelRows(workspaces, entities, relationships);

    const skipped: string[] = [];
    const modelHashes = await migrateModelFiles(
      workspaces,
      entities,
      relationships,
      skipped,
    );
    migrateRegistryRows(options.target, users, workspaces, members);

    const manifest: LegacySqliteMigrationManifest = {
      version: MIGRATION_VERSION,
      source: {
        path: sourcePath,
        sha256: await fileHash(sourcePath),
        schema: 'seaorm-sqlite',
        counts: {
          users: users.length,
          workspaces: workspaces.length,
          members: members.length,
          logicalEntities: entities.length,
          logicalRelationships: relationships.length,
        },
      },
      target: {
        path: targetPath,
        schema: 'sqlite-registry-v1',
        counts: targetCounts(options.target),
      },
      backupPaths,
      modelHashes,
      skipped,
      startedAt,
      completedAt: new Date().toISOString(),
      toolVersion: process.env['GITHUB_SHA'] ?? 'development',
    };
    await writeJsonAtomically(markerPath, manifest);
    return manifest;
  } catch (error) {
    throw DomainError.internal(
      `legacy desktop data migration failed: ${errorMessage(error)}`,
    );
  } finally {
    source.close();
  }
}

export function migrationMarkerPath(targetPath: string): string {
  return join(dirname(targetPath), 'legacy-migration.json');
}

function databaseConstructor(): DatabaseSyncConstructor {
  return (
    nodeRequire('node:sqlite') as { DatabaseSync: DatabaseSyncConstructor }
  ).DatabaseSync;
}

function readUsers(database: SqliteDatabase): LegacyUserRow[] {
  return hasTable(database, 'users')
    ? rows<LegacyUserRow>(database, 'SELECT id, name, email FROM users')
    : [];
}

function readWorkspaces(database: SqliteDatabase): LegacyWorkspaceRow[] {
  return hasTable(database, 'workspaces')
    ? rows<LegacyWorkspaceRow>(
        database,
        `SELECT id, title, description, status, metadata,
                created_at, updated_at, deleted_at
           FROM workspaces`,
      )
    : [];
}

function readMembers(database: SqliteDatabase): LegacyMemberRow[] {
  const table = hasTable(database, 'members')
    ? 'members'
    : hasTable(database, 'workspace_members')
      ? 'workspace_members'
      : null;
  return table
    ? rows<LegacyMemberRow>(
        database,
        `SELECT id, workspace_id, user_id, role, created_at, updated_at FROM ${table}`,
      )
    : [];
}

function readEntities(database: SqliteDatabase): LegacyEntityRow[] {
  return hasTable(database, 'logical_entities')
    ? rows<LegacyEntityRow>(
        database,
        `SELECT id, workspace_id, type, sub_type, name, label,
                definition, deleted_at
           FROM logical_entities`,
      )
    : [];
}

function readRelationships(database: SqliteDatabase): LegacyRelationshipRow[] {
  return hasTable(database, 'logical_relationships')
    ? rows<LegacyRelationshipRow>(
        database,
        `SELECT id, workspace_id, source_id, target_id, label, deleted_at
           FROM logical_relationships`,
      )
    : [];
}

function hasTable(database: SqliteDatabase, table: string): boolean {
  return Boolean(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table),
  );
}

function rows<T>(database: SqliteDatabase, sql: string): T[] {
  return database.prepare(sql).all() as T[];
}

async function prepareWorkspaces(
  rowsToPrepare: LegacyWorkspaceRow[],
  defaultWorkspacePath: string,
): Promise<PreparedWorkspace[]> {
  const legacyRoot = join(dirname(defaultWorkspacePath), 'legacy-workspaces');
  return Promise.all(
    rowsToPrepare.map(async (workspace) => {
      const metadata = parseStringRecord(workspace.metadata);
      const fallback =
        workspace.id === 'default-workspace'
          ? defaultWorkspacePath
          : join(legacyRoot, safePathSegment(workspace.id));
      if (!hasConfiguredRoot(metadata)) {
        await mkdir(fallback, { recursive: true });
      }
      return {
        ...workspace,
        created_at: isoTimestamp(workspace.created_at, 'workspace created_at'),
        updated_at: isoTimestamp(workspace.updated_at, 'workspace updated_at'),
        deleted_at: optionalIsoTimestamp(
          workspace.deleted_at,
          'workspace deleted_at',
        ),
        metadataObject: await normalizeWorkspaceMetadata(metadata, fallback),
      };
    }),
  );
}

function validateRegistryRows(
  users: LegacyUserRow[],
  workspaces: PreparedWorkspace[],
  members: LegacyMemberRow[],
): void {
  const userIds = uniqueIds(users, 'user');
  const workspaceIds = uniqueIds(workspaces, 'workspace');
  const memberships = new Set<string>();
  const ownerWorkspaces = new Set<string>();

  for (const member of members) {
    if (
      !workspaceIds.has(member.workspace_id) ||
      !userIds.has(member.user_id)
    ) {
      throw new Error(
        `member ${member.id} references a missing user or workspace`,
      );
    }
    const key = `${member.workspace_id}\u0000${member.user_id}`;
    if (memberships.has(key)) {
      throw new Error(
        `duplicate membership for ${member.workspace_id}/${member.user_id}`,
      );
    }
    memberships.add(key);
    if (member.role === 'owner') {
      ownerWorkspaces.add(member.workspace_id);
    }
    isoTimestamp(member.created_at, 'member created_at');
    isoTimestamp(member.updated_at, 'member updated_at');
  }

  for (const workspace of workspaces) {
    if (!workspace.deleted_at && !ownerWorkspaces.has(workspace.id)) {
      throw new Error(`workspace ${workspace.id} has no owner`);
    }
  }
}

function validateModelRows(
  workspaces: PreparedWorkspace[],
  entities: LegacyEntityRow[],
  relationships: LegacyRelationshipRow[],
): void {
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const visibleEntities = new Map<string, Set<string>>();
  for (const entity of entities) {
    assertSafeModelId(entity.id);
    if (!workspaceIds.has(entity.workspace_id)) {
      throw new Error(
        `logical entity ${entity.id} references a missing workspace`,
      );
    }
    if (!entity.deleted_at) {
      const ids = visibleEntities.get(entity.workspace_id) ?? new Set<string>();
      if (ids.has(entity.id)) {
        throw new Error(`duplicate logical entity ${entity.id}`);
      }
      ids.add(entity.id);
      visibleEntities.set(entity.workspace_id, ids);
    }
  }

  for (const relationship of relationships) {
    assertSafeModelId(relationship.id);
    if (relationship.deleted_at) {
      continue;
    }
    const ids = visibleEntities.get(relationship.workspace_id);
    if (!ids?.has(relationship.source_id) || !ids.has(relationship.target_id)) {
      throw new Error(
        `logical relationship ${relationship.id} has an invalid endpoint`,
      );
    }
  }
}

async function migrateModelFiles(
  workspaces: PreparedWorkspace[],
  entities: LegacyEntityRow[],
  relationships: LegacyRelationshipRow[],
  skipped: string[],
): Promise<Record<string, string>> {
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace]),
  );
  for (const entity of entities) {
    if (entity.deleted_at) {
      skipped.push(`deleted logical entity ${entity.id}`);
      continue;
    }
    const workspace = workspaceById.get(entity.workspace_id);
    if (!workspace) {
      continue;
    }
    const evidenceRoot = requiredMetadata(
      workspace.metadataObject,
      'evidenceRoot',
    );
    await writeYamlIfMissing(
      join(evidenceRoot, 'entities', `${entity.id}.yaml`),
      entityDocument(entity),
      skipped,
    );
  }

  for (const relationship of relationships) {
    if (relationship.deleted_at) {
      skipped.push(`deleted logical relationship ${relationship.id}`);
      continue;
    }
    const workspace = workspaceById.get(relationship.workspace_id);
    if (!workspace) {
      continue;
    }
    const evidenceRoot = requiredMetadata(
      workspace.metadataObject,
      'evidenceRoot',
    );
    await writeYamlIfMissing(
      join(evidenceRoot, 'associations', `${relationship.id}.yaml`),
      relationshipDocument(relationship),
      skipped,
    );
  }

  return Object.fromEntries(
    await Promise.all(
      workspaces.map(async (workspace) => {
        const evidenceRoot = requiredMetadata(
          workspace.metadataObject,
          'evidenceRoot',
        );
        return [workspace.id, await hashEvidenceModel(evidenceRoot)] as const;
      }),
    ),
  );
}

function migrateRegistryRows(
  target: SqliteDatabase,
  users: LegacyUserRow[],
  workspaces: PreparedWorkspace[],
  members: LegacyMemberRow[],
): void {
  target.exec('BEGIN IMMEDIATE');
  try {
    const insertUser = target.prepare(
      'INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)',
    );
    for (const user of users) {
      insertUser.run(
        user.id,
        user.name,
        user.email ?? `${user.id}@legacy.local`,
      );
    }

    const insertWorkspace = target.prepare(
      `INSERT OR IGNORE INTO workspaces
        (id, title, description, status, metadata, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const workspace of workspaces) {
      insertWorkspace.run(
        workspace.id,
        workspace.title,
        workspace.description,
        workspace.status,
        JSON.stringify(workspace.metadataObject),
        workspace.created_at,
        workspace.updated_at,
        workspace.deleted_at,
      );
    }

    const insertMember = target.prepare(
      `INSERT OR IGNORE INTO workspace_members
        (id, workspace_id, user_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const member of members) {
      insertMember.run(
        member.id,
        member.workspace_id,
        member.user_id,
        member.role,
        isoTimestamp(member.created_at, 'member created_at'),
        isoTimestamp(member.updated_at, 'member updated_at'),
      );
    }
    target.exec('COMMIT');
  } catch (error) {
    target.exec('ROLLBACK');
    throw error;
  }
}

function targetCounts(target: SqliteDatabase): Record<string, number> {
  return {
    users: count(target, 'users'),
    workspaces: count(target, 'workspaces'),
    members: count(target, 'workspace_members'),
  };
}

function count(database: SqliteDatabase, table: string): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get() as { count: number | bigint } | undefined;
  return Number(row?.count ?? 0);
}

function entityDocument(entity: LegacyEntityRow): Record<string, unknown> {
  const definition = parseRecord(entity.definition);
  const description = optionalString(
    definition['description'] ?? definition['content'],
  );
  const attributes = Array.isArray(definition['attributes'])
    ? definition['attributes']
    : [];
  return {
    id: entity.id,
    name: entity.name,
    ...(entity.label ? { label: entity.label } : {}),
    type: entity.type,
    ...(entity.sub_type ? { subType: entity.sub_type } : {}),
    ...(description ? { description } : {}),
    ...(attributes.length > 0 ? { attributes } : {}),
  };
}

function relationshipDocument(
  relationship: LegacyRelationshipRow,
): Record<string, unknown> {
  return {
    id: relationship.id,
    kind: 'association',
    name: relationshipName(relationship.id),
    ...(relationship.label ? { label: relationship.label } : {}),
    source: relationship.source_id,
    target: relationship.target_id,
    relationshipType: 'relates_to',
    direction: 'directed',
  };
}

async function writeYamlIfMissing(
  path: string,
  document: Record<string, unknown>,
  skipped: string[],
): Promise<void> {
  if (await pathExists(path)) {
    skipped.push(`existing model file ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.migration-${process.pid}`;
  await writeFile(temporary, stringify(document, { lineWidth: 0 }), 'utf8');
  await rename(temporary, path);
}

async function hashEvidenceModel(evidenceRoot: string): Promise<string> {
  const hash = createHash('sha256');
  for (const directory of ['entities', 'associations']) {
    const root = join(evidenceRoot, directory);
    if (!(await pathExists(root))) {
      continue;
    }
    const entries = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      hash.update(`${directory}/${entry.name}\u0000`);
      hash.update(await readFile(join(root, entry.name)));
    }
  }
  return hash.digest('hex');
}

async function backupLegacyDatabase(
  sourcePath: string,
  targetPath: string,
): Promise<string[]> {
  const backupRoot = join(dirname(targetPath), 'legacy-backups');
  await mkdir(backupRoot, { recursive: true });
  const suffix = new Date().toISOString().replace(/[:.]/g, '-');
  const copied: string[] = [];
  for (const extension of ['', '-wal', '-shm']) {
    const source = `${sourcePath}${extension}`;
    if (!(await pathExists(source))) {
      continue;
    }
    const destination = join(
      backupRoot,
      `${basename(sourcePath)}-${suffix}${extension}`,
    );
    await copyFile(source, destination);
    copied.push(destination);
  }
  return copied;
}

async function writeJsonAtomically(
  path: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function fileHash(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

function parseStringRecord(value: unknown): Record<string, string> {
  const record = parseRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return parseRecord(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueIds<T extends { id: string }>(
  values: T[],
  resource: string,
): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) {
      throw new Error(`duplicate ${resource} ${value.id}`);
    }
    ids.add(value.id);
  }
  return ids;
}

function hasConfiguredRoot(metadata: Record<string, string>): boolean {
  return ['repositoryRoot', 'path', 'rootPath'].some((key) =>
    metadata[key]?.trim(),
  );
}

function requiredMetadata(
  metadata: Record<string, string>,
  key: string,
): string {
  const value = metadata[key]?.trim();
  if (!value) {
    throw new Error(`workspace metadata ${key} missing after normalization`);
  }
  return value;
}

function safePathSegment(value: string): string {
  const segment = value.replace(/[^a-zA-Z0-9._-]/g, '_');
  return segment || 'workspace';
}

function assertSafeModelId(id: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new Error(`unsafe model id ${id}`);
  }
}

function relationshipName(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}

function isoTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new Error(`${field} is not a valid timestamp: ${value}`);
  }
  return timestamp.toISOString();
}

function optionalIsoTimestamp(
  value: string | null,
  field: string,
): string | null {
  return value ? isoTimestamp(value, field) : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
