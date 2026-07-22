import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Client, type QueryResultRow } from 'pg';
import { stringify } from 'yaml';
import {
  normalizeWorkspaceMetadata,
  publicWorkspaceMetadata,
} from '@evidence/server-persistent/workspace-paths';

interface LegacyUser extends QueryResultRow {
  id: string;
  name: string;
  email: string | null;
}

interface LegacyWorkspace extends QueryResultRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  metadata: unknown;
  created_at: unknown;
  updated_at: unknown;
  deleted_at: unknown | null;
}

interface LegacyMember extends QueryResultRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: unknown;
  updated_at: unknown;
}

interface LegacyLogicalEntity extends QueryResultRow {
  id: string;
  workspace_id: string;
  type: string;
  sub_type: string | null;
  name: string;
  label: string | null;
  definition: unknown;
  created_at: unknown;
  updated_at: unknown;
  deleted_at: unknown | null;
}

interface LegacyLogicalRelationship extends QueryResultRow {
  id: string;
  workspace_id: string;
  source_id: string;
  target_id: string;
  label: string | null;
  deleted_at: unknown | null;
}

interface PreparedWorkspace extends LegacyWorkspace {
  metadataObject: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface PreparedEntity extends LegacyLogicalEntity {
  description: string | null;
  attributes: unknown[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface PreparedRelationship extends LegacyLogicalRelationship {
  deletedAt: Date | null;
}

interface MigrationData {
  users: LegacyUser[];
  workspaces: PreparedWorkspace[];
  members: LegacyMember[];
  entities: PreparedEntity[];
  relationships: PreparedRelationship[];
  retiredDiagramRows: Record<string, number>;
}

export interface PostgresMigrationManifest {
  version: 1;
  dryRun: boolean;
  source: {
    schema: 'seaorm-postgres';
    backupId: string;
    sha256: string;
    counts: Record<string, number>;
  };
  target: {
    schema: 'prisma-postgres';
    counts: Record<string, number>;
  };
  modelHashes: Record<string, string>;
  skipped: string[];
  startedAt: string;
  completedAt: string;
  toolVersion: string;
}

export interface SeaOrmPostgresMigrationOptions {
  sourceDatabaseUrl: string;
  targetDatabaseUrl: string;
  modelRoot: string;
  manifestPath: string;
  sourceBackupId: string;
  dryRun?: boolean;
}

export async function migrateSeaOrmPostgres(
  options: SeaOrmPostgresMigrationOptions,
): Promise<PostgresMigrationManifest> {
  if (options.sourceDatabaseUrl === options.targetDatabaseUrl) {
    throw new Error('source and target PostgreSQL databases must be different');
  }
  if (!options.sourceBackupId.trim()) {
    throw new Error('a source backup identifier is required');
  }

  const source = new Client({ connectionString: options.sourceDatabaseUrl });
  const target = new Client({ connectionString: options.targetDatabaseUrl });
  const startedAt = new Date().toISOString();
  await Promise.all([source.connect(), target.connect()]);

  try {
    const data = await readMigrationData(source, options.modelRoot);
    validateMigrationData(data);
    const skipped = retiredDiagramSummary(data.retiredDiagramRows);
    let modelHashes: Record<string, string> = {};

    if (!options.dryRun) {
      modelHashes = await writeModelFiles(data, skipped);
      await writeTargetRows(target, data);
    }

    const manifest: PostgresMigrationManifest = {
      version: 1,
      dryRun: options.dryRun === true,
      source: {
        schema: 'seaorm-postgres',
        backupId: options.sourceBackupId,
        sha256: migrationDataHash(data),
        counts: sourceCounts(data),
      },
      target: {
        schema: 'prisma-postgres',
        counts: await targetCounts(target),
      },
      modelHashes,
      skipped,
      startedAt,
      completedAt: new Date().toISOString(),
      toolVersion: process.env['GITHUB_SHA'] ?? 'development',
    };
    await writeJsonAtomically(resolve(options.manifestPath), manifest);
    return manifest;
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

async function readMigrationData(
  source: Client,
  modelRoot: string,
): Promise<MigrationData> {
  const [users, rawWorkspaces, members, rawEntities, rawRelationships] =
    await Promise.all([
      queryRows<LegacyUser>(
        source,
        'SELECT id, name, email FROM users ORDER BY id',
      ),
      queryRows<LegacyWorkspace>(
        source,
        `SELECT id, title, description, status, metadata,
                created_at, updated_at, deleted_at
           FROM workspaces
          ORDER BY id`,
      ),
      queryRows<LegacyMember>(
        source,
        `SELECT id, workspace_id, user_id, role, created_at, updated_at
           FROM members
          ORDER BY id`,
      ),
      queryOptionalRows<LegacyLogicalEntity>(
        source,
        'logical_entities',
        `SELECT id, workspace_id, type, sub_type, name, label, definition,
                created_at, updated_at, deleted_at
           FROM logical_entities
          ORDER BY id`,
      ),
      queryOptionalRows<LegacyLogicalRelationship>(
        source,
        'logical_relationships',
        `SELECT id, workspace_id, source_id, target_id, label, deleted_at
           FROM logical_relationships
          ORDER BY id`,
      ),
    ]);

  const workspaces = await Promise.all(
    rawWorkspaces.map(async (workspace) => {
      const metadata = stringRecord(workspace.metadata);
      const fallback = join(resolve(modelRoot), safePathSegment(workspace.id));
      if (!configuredRoot(metadata)) {
        await mkdir(fallback, { recursive: true });
      }
      return {
        ...workspace,
        metadataObject: await normalizeWorkspaceMetadata(metadata, fallback),
        createdAt: timestamp(workspace.created_at, 'workspace created_at'),
        updatedAt: timestamp(workspace.updated_at, 'workspace updated_at'),
        deletedAt: optionalTimestamp(
          workspace.deleted_at,
          'workspace deleted_at',
        ),
      };
    }),
  );

  const entities = rawEntities.map((entity) => {
    const definition = record(entity.definition);
    return {
      ...entity,
      description: optionalString(
        definition['description'] ?? definition['content'],
      ),
      attributes: Array.isArray(definition['attributes'])
        ? definition['attributes']
        : [],
      createdAt: timestamp(entity.created_at, 'logical entity created_at'),
      updatedAt: timestamp(entity.updated_at, 'logical entity updated_at'),
      deletedAt: optionalTimestamp(
        entity.deleted_at,
        'logical entity deleted_at',
      ),
    };
  });
  const relationships = rawRelationships.map((relationship) => ({
    ...relationship,
    deletedAt: optionalTimestamp(
      relationship.deleted_at,
      'logical relationship deleted_at',
    ),
  }));

  return {
    users,
    workspaces,
    members,
    entities,
    relationships,
    retiredDiagramRows: await retiredDiagramCounts(source),
  };
}

export function validateMigrationData(data: MigrationData): void {
  const userIds = uniqueIds(data.users, 'user');
  const workspaceIds = uniqueIds(data.workspaces, 'workspace');
  const membershipKeys = new Set<string>();
  const ownerWorkspaces = new Set<string>();

  for (const member of data.members) {
    if (
      !userIds.has(member.user_id) ||
      !workspaceIds.has(member.workspace_id)
    ) {
      throw new Error(
        `member ${member.id} references a missing user or workspace`,
      );
    }
    const key = `${member.workspace_id}\u0000${member.user_id}`;
    if (membershipKeys.has(key)) {
      throw new Error(
        `duplicate membership ${member.workspace_id}/${member.user_id}`,
      );
    }
    membershipKeys.add(key);
    if (member.role === 'owner') {
      ownerWorkspaces.add(member.workspace_id);
    }
    timestamp(member.created_at, 'member created_at');
    timestamp(member.updated_at, 'member updated_at');
  }
  for (const workspace of data.workspaces) {
    if (!workspace.deletedAt && !ownerWorkspaces.has(workspace.id)) {
      throw new Error(`workspace ${workspace.id} has no owner`);
    }
  }

  const entityIds = new Map<string, Set<string>>();
  for (const entity of data.entities) {
    assertSafeModelId(entity.id);
    if (!workspaceIds.has(entity.workspace_id)) {
      throw new Error(
        `logical entity ${entity.id} references a missing workspace`,
      );
    }
    if (!entity.deletedAt) {
      const ids = entityIds.get(entity.workspace_id) ?? new Set<string>();
      if (ids.has(entity.id)) {
        throw new Error(`duplicate logical entity ${entity.id}`);
      }
      ids.add(entity.id);
      entityIds.set(entity.workspace_id, ids);
    }
  }
  for (const relationship of data.relationships) {
    assertSafeModelId(relationship.id);
    if (relationship.deletedAt) {
      continue;
    }
    const ids = entityIds.get(relationship.workspace_id);
    if (!ids?.has(relationship.source_id) || !ids.has(relationship.target_id)) {
      throw new Error(
        `logical relationship ${relationship.id} has an invalid endpoint`,
      );
    }
  }
}

async function writeTargetRows(
  target: Client,
  data: MigrationData,
): Promise<void> {
  await target.query('BEGIN');
  try {
    for (const user of data.users) {
      await target.query(
        `INSERT INTO users (id, name, email) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.name, user.email],
      );
    }
    for (const workspace of data.workspaces) {
      await target.query(
        `INSERT INTO workspaces
          (id, title, description, status, metadata, model_root, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          workspace.id,
          workspace.title,
          workspace.description,
          workspace.status,
          JSON.stringify(publicWorkspaceMetadata(workspace.metadataObject)),
          requiredMetadata(workspace.metadataObject, 'evidenceRoot'),
          workspace.createdAt,
          workspace.updatedAt,
          workspace.deletedAt,
        ],
      );
    }
    for (const member of data.members) {
      await target.query(
        `INSERT INTO workspace_members
          (id, workspace_id, user_id, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          member.id,
          member.workspace_id,
          member.user_id,
          member.role,
          timestamp(member.created_at, 'member created_at'),
          timestamp(member.updated_at, 'member updated_at'),
        ],
      );
    }
    for (const entity of data.entities) {
      await target.query(
        `INSERT INTO logical_entities
          (id, workspace_id, type, sub_type, name, label, description,
           attributes, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          entity.id,
          entity.workspace_id,
          entity.type,
          entity.sub_type,
          entity.name,
          entity.label,
          entity.description,
          JSON.stringify(entity.attributes),
          entity.createdAt,
          entity.updatedAt,
          entity.deletedAt,
        ],
      );
    }
    for (const relationship of data.relationships) {
      await target.query(
        `INSERT INTO logical_relationships
          (id, workspace_id, source_id, target_id, label, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          relationship.id,
          relationship.workspace_id,
          relationship.source_id,
          relationship.target_id,
          relationship.label,
          relationship.deletedAt,
        ],
      );
    }
    await target.query('COMMIT');
  } catch (error) {
    await target.query('ROLLBACK');
    throw error;
  }
}

async function writeModelFiles(
  data: MigrationData,
  skipped: string[],
): Promise<Record<string, string>> {
  const workspaceById = new Map(
    data.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  for (const entity of data.entities) {
    if (entity.deletedAt) {
      skipped.push(`deleted logical entity ${entity.id}`);
      continue;
    }
    const workspace = workspaceById.get(entity.workspace_id);
    if (!workspace) continue;
    await writeYamlIfMissing(
      join(
        requiredMetadata(workspace.metadataObject, 'evidenceRoot'),
        'entities',
        `${entity.id}.yaml`,
      ),
      {
        id: entity.id,
        name: entity.name,
        ...(entity.label ? { label: entity.label } : {}),
        type: entity.type,
        ...(entity.sub_type ? { subType: entity.sub_type } : {}),
        ...(entity.description ? { description: entity.description } : {}),
        ...(entity.attributes.length > 0
          ? { attributes: entity.attributes }
          : {}),
      },
      skipped,
    );
  }
  for (const relationship of data.relationships) {
    if (relationship.deletedAt) {
      skipped.push(`deleted logical relationship ${relationship.id}`);
      continue;
    }
    const workspace = workspaceById.get(relationship.workspace_id);
    if (!workspace) continue;
    await writeYamlIfMissing(
      join(
        requiredMetadata(workspace.metadataObject, 'evidenceRoot'),
        'associations',
        `${relationship.id}.yaml`,
      ),
      {
        id: relationship.id,
        kind: 'association',
        name: relationshipName(relationship.id),
        ...(relationship.label ? { label: relationship.label } : {}),
        source: relationship.source_id,
        target: relationship.target_id,
        relationshipType: 'relates_to',
        direction: 'directed',
      },
      skipped,
    );
  }

  return Object.fromEntries(
    await Promise.all(
      data.workspaces.map(async (workspace) => {
        const root = requiredMetadata(workspace.metadataObject, 'evidenceRoot');
        return [workspace.id, await modelHash(root)] as const;
      }),
    ),
  );
}

async function queryRows<T extends QueryResultRow>(
  client: Client,
  sql: string,
): Promise<T[]> {
  return (await client.query<T>(sql)).rows;
}

async function queryOptionalRows<T extends QueryResultRow>(
  client: Client,
  table: string,
  sql: string,
): Promise<T[]> {
  const exists = await client.query<{ name: string | null }>(
    'SELECT to_regclass($1) AS name',
    [`public.${table}`],
  );
  return exists.rows[0]?.name ? queryRows<T>(client, sql) : [];
}

async function retiredDiagramCounts(
  source: Client,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of ['diagrams', 'diagram_nodes', 'diagram_edges']) {
    const rowsForTable = await queryOptionalRows<{ count: string }>(
      source,
      table,
      `SELECT COUNT(*)::text AS count FROM ${table}`,
    );
    counts[table] = Number(rowsForTable[0]?.count ?? 0);
  }
  return counts;
}

async function targetCounts(target: Client): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of [
    'users',
    'workspaces',
    'workspace_members',
    'logical_entities',
    'logical_relationships',
  ]) {
    const result = await target.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${table}`,
    );
    counts[table] = Number(result.rows[0]?.count ?? 0);
  }
  return counts;
}

function sourceCounts(data: MigrationData): Record<string, number> {
  return {
    users: data.users.length,
    workspaces: data.workspaces.length,
    members: data.members.length,
    logicalEntities: data.entities.length,
    logicalRelationships: data.relationships.length,
    ...data.retiredDiagramRows,
  };
}

function retiredDiagramSummary(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => `retired projection ${table}: ${count} rows`);
}

export function migrationDataHash(data: MigrationData): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        users: data.users,
        workspaces: data.workspaces.map(({ metadataObject, ...workspace }) => ({
          ...workspace,
          metadata: metadataObject,
        })),
        members: data.members,
        entities: data.entities,
        relationships: data.relationships,
        retiredDiagramRows: data.retiredDiagramRows,
      }),
    )
    .digest('hex');
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

async function modelHash(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const directory of ['entities', 'associations']) {
    const path = join(root, directory);
    if (!(await pathExists(path))) continue;
    const entries = (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      hash.update(`${directory}/${entry.name}\u0000`);
      hash.update(await readFile(join(path, entry.name)));
    }
  }
  return hash.digest('hex');
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

function timestamp(value: unknown, field: string): Date {
  const result = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(result.valueOf())) {
    throw new Error(`${field} is not a valid timestamp: ${String(value)}`);
  }
  return result;
}

function optionalTimestamp(value: unknown | null, field: string): Date | null {
  return value === null || value === undefined ? null : timestamp(value, field);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return record(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function uniqueIds<T extends { id: string }>(
  values: T[],
  resource: string,
): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) throw new Error(`duplicate ${resource} ${value.id}`);
    ids.add(value.id);
  }
  return ids;
}

function configuredRoot(metadata: Record<string, string>): boolean {
  return ['repositoryRoot', 'path', 'rootPath'].some((key) =>
    metadata[key]?.trim(),
  );
}

function requiredMetadata(
  metadata: Record<string, string>,
  key: string,
): string {
  const value = metadata[key]?.trim();
  if (!value) throw new Error(`workspace metadata ${key} missing`);
  return value;
}

function assertSafeModelId(id: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new Error(`unsafe model id ${id}`);
  }
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'workspace';
}

function relationshipName(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
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
