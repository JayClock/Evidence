import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { apiAuthorization, apiBaseUrl } from './api-contracts.js';

interface CompatibilityManifest {
  openapi: FileBaseline & { pathCount: number; operationCount: number };
  database: {
    prismaSchema: FileBaseline & { modelCount: number };
    migrationLock: FileBaseline;
    migrationChainSha256: string;
    migrations: Array<{ version: string; sha256: string }>;
    catalog: CatalogBaseline;
  };
}

interface FileBaseline {
  path: string;
  sha256: string;
}

interface CatalogBaseline {
  tableCount: number;
  sha256: string;
  tables: Record<string, string>;
}

interface CatalogRow {
  tableName: string;
  kind: 'column' | 'constraint' | 'index';
  description: Record<string, unknown>;
}

interface TableDescription {
  columns: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
}

interface GoldenExchange {
  status: number;
  contentType: string | null;
  location: string | null;
  body: unknown;
}

const repositoryRoot = resolve(import.meta.dirname, '../../../../..');
const baselineRoot = resolve(import.meta.dirname, '../../baseline');
const manifest = readJson<CompatibilityManifest>('compatibility-v1.json');
const halGoldens = readJson<Record<string, GoldenExchange>>('hal-goldens.json');
const describeDatabase =
  process.env.DATABASE_URL && apiBaseUrl ? describe : describe.skip;
const describeHal = apiBaseUrl ? describe : describe.skip;

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(resolve(baselineRoot, fileName), 'utf8')) as T;
}

function repositoryFile(path: string): string {
  return resolve(repositoryRoot, path);
}

describe('Nest replacement static compatibility baseline', () => {
  it('freezes the OpenAPI source bytes and operation surface', () => {
    const source = readFileSync(repositoryFile(manifest.openapi.path));
    const text = source.toString('utf8');

    expect(sha256(source)).toBe(manifest.openapi.sha256);
    expect(text.match(/^ {2}\/.*:$/gm) ?? []).toHaveLength(
      manifest.openapi.pathCount,
    );
    expect(
      text.match(/^ {4}(get|post|put|patch|delete|head|options|trace):$/gm) ??
        [],
    ).toHaveLength(manifest.openapi.operationCount);
  });

  it('freezes the Prisma model and all pre-replacement migrations', () => {
    const schema = readFileSync(
      repositoryFile(manifest.database.prismaSchema.path),
    );
    const schemaText = schema.toString('utf8');
    const migrationLock = readFileSync(
      repositoryFile(manifest.database.migrationLock.path),
    );
    const migrationRoot = repositoryFile(
      'libs/server/persistent/prisma/migrations',
    );
    const actualVersions = readdirSync(migrationRoot, {
      withFileTypes: true,
    })
      .filter((entry: Dirent) => entry.isDirectory())
      .map((entry: Dirent) => entry.name)
      .sort((left: string, right: string) => left.localeCompare(right));
    const baselineVersions = manifest.database.migrations.map(
      ({ version }) => version,
    );

    expect(sha256(schema)).toBe(manifest.database.prismaSchema.sha256);
    expect(schemaText.match(/^model /gm) ?? []).toHaveLength(
      manifest.database.prismaSchema.modelCount,
    );
    expect(sha256(migrationLock)).toBe(manifest.database.migrationLock.sha256);
    expect(actualVersions).toEqual(expect.arrayContaining(baselineVersions));

    const chain = createHash('sha256');
    for (const migration of manifest.database.migrations) {
      const source = readFileSync(
        resolve(migrationRoot, migration.version, 'migration.sql'),
      );
      expect(sha256(source), migration.version).toBe(migration.sha256);
      chain.update(migration.version);
      chain.update('\0');
      chain.update(source);
      chain.update('\0');
    }
    expect(`sha256:${chain.digest('hex')}`).toBe(
      manifest.database.migrationChainSha256,
    );

    const lastBaselineVersion = baselineVersions.at(-1);
    expect(lastBaselineVersion).toBeDefined();
    expect(
      actualVersions.filter(
        (version) =>
          !baselineVersions.includes(version) &&
          version.localeCompare(lastBaselineVersion ?? '') <= 0,
      ),
    ).toEqual([]);
  });
});

describeDatabase('Nest replacement PostgreSQL catalog baseline', () => {
  it('matches migrated columns, constraints, and indexes table by table', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const catalogSql = readFileSync(
        resolve(baselineRoot, 'database-catalog.sql'),
        'utf8',
      );
      const result = await pool.query<CatalogRow>(catalogSql);
      const tables = assembleCatalog(result.rows);
      const actual: CatalogBaseline = {
        tableCount: Object.keys(tables).length,
        sha256: hashCanonicalJson(tables),
        tables: Object.fromEntries(
          Object.entries(tables).map(([name, description]) => [
            name,
            hashCanonicalJson(description),
          ]),
        ),
      };

      expect(actual.tables).toEqual(manifest.database.catalog.tables);
      expect(actual).toEqual(manifest.database.catalog);
    } finally {
      await pool.end();
    }
  });
});

describeHal('Nest replacement HAL wire goldens', () => {
  it('matches representative authentication, resource, collection, error, and empty responses', async () => {
    let workspaceId: string | undefined;
    let deleted = false;
    try {
      const unauthorizedRoot = await captureExchange('/api', {}, false);
      const root = await captureExchange('/api');
      const health = await captureExchange('/health');
      const user = await captureExchange('/api/users/desktop-user');
      const workspace = await captureExchange('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Java Compatibility Baseline',
          description: 'Frozen HAL resource shape',
          metadata: { source: 'compatibility-baseline' },
        }),
      });
      workspaceId = requireWorkspaceId(workspace.body);
      const logicalEntities = await captureExchange(
        `/api/workspaces/${workspaceId}/logical-entities?page=1&pageSize=20`,
      );
      const diagram = await captureExchange(
        `/api/workspaces/${workspaceId}/diagram`,
      );
      const missing = await captureExchange(
        `/api/workspaces/${workspaceId}/logical-entities/missing-entity`,
      );
      const deletedExchange = await captureExchange(
        `/api/workspaces/${workspaceId}`,
        { method: 'DELETE' },
      );
      deleted = true;

      expect(
        normalizeRuntimeValues(
          {
            unauthorizedRoot,
            root,
            health,
            user,
            workspace,
            logicalEntities,
            diagram,
            missing,
            deleted: deletedExchange,
          },
          workspaceId,
        ),
      ).toEqual(halGoldens);
    } finally {
      if (workspaceId && !deleted) {
        await deleteWorkspaceSilently(workspaceId);
      }
    }
  });
});

function assembleCatalog(rows: CatalogRow[]): Record<string, TableDescription> {
  const tables: Record<string, TableDescription> = {};
  for (const row of rows) {
    const table = (tables[row.tableName] ??= {
      columns: [],
      constraints: [],
      indexes: [],
    });
    if (row.kind === 'column') table.columns.push(row.description);
    if (row.kind === 'constraint') table.constraints.push(row.description);
    if (row.kind === 'index') table.indexes.push(row.description);
  }
  return tables;
}

async function captureExchange(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<GoldenExchange> {
  if (!apiBaseUrl) throw new Error('API_BASE_URL is required');
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/*+json',
        ...(authenticated && apiAuthorization
          ? { authorization: apiAuthorization }
          : {}),
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const text = await response.text();
    return {
      status: response.status,
      contentType: normalizeContentType(response.headers.get('content-type')),
      location: response.headers.get('location'),
      body: text ? (JSON.parse(text) as unknown) : null,
    };
  } catch (error) {
    throw new Error(`Could not capture compatibility response for ${path}`, {
      cause: error,
    });
  }
}

async function deleteWorkspaceSilently(workspaceId: string): Promise<void> {
  try {
    await captureExchange(`/api/workspaces/${workspaceId}`, {
      method: 'DELETE',
    });
  } catch {
    // Preserve the original compatibility failure.
  }
}

function requireWorkspaceId(body: unknown): string {
  if (!body || typeof body !== 'object' || !('id' in body)) {
    throw new Error('Compatibility workspace response has no id');
  }
  const id = body.id;
  if (typeof id !== 'string' || !id) {
    throw new Error('Compatibility workspace id is invalid');
  }
  return id;
}

function normalizeRuntimeValues(value: unknown, workspaceId: string): unknown {
  if (typeof value === 'string') {
    if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) {
      return '<timestamp>';
    }
    return value.replaceAll(workspaceId, '<workspace-id>');
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeRuntimeValues(entry, workspaceId));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeRuntimeValues(entry, workspaceId),
      ]),
    );
  }
  return value;
}

function normalizeContentType(value: string | null): string | null {
  return value?.split(';')[0]?.trim().toLowerCase() ?? null;
}

function sha256(value: Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashCanonicalJson(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
