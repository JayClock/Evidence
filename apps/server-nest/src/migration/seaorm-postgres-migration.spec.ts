import { describe, expect, it } from 'vitest';
import {
  migrationDataHash,
  validateMigrationData,
} from './seaorm-postgres-migration';

type MigrationData = Parameters<typeof validateMigrationData>[0];

describe('SeaORM PostgreSQL migration validation', () => {
  it('accepts a complete owner and relationship graph deterministically', () => {
    const data = fixture();

    expect(() => validateMigrationData(data)).not.toThrow();
    expect(migrationDataHash(data)).toMatch(/^[a-f0-9]{64}$/);
    expect(migrationDataHash(data)).toBe(migrationDataHash(data));
  });

  it('rejects an active workspace without an owner', () => {
    const data = fixture();
    const member = data.members[0];
    if (!member) throw new Error('member fixture missing');
    member.role = 'member';

    expect(() => validateMigrationData(data)).toThrow(
      'workspace workspace-1 has no owner',
    );
  });

  it('rejects relationships whose endpoint is not visible', () => {
    const data = fixture();
    const relationship = data.relationships[0];
    if (!relationship) throw new Error('relationship fixture missing');
    relationship.target_id = 'missing';

    expect(() => validateMigrationData(data)).toThrow(
      'logical relationship order_customer has an invalid endpoint',
    );
  });
});

function fixture(): MigrationData {
  const timestamp = new Date('2026-05-26T12:00:00Z');
  return {
    users: [
      {
        id: 'user-1',
        name: 'User',
        email: 'user@example.com',
      },
    ],
    workspaces: [
      {
        id: 'workspace-1',
        title: 'Workspace',
        description: null,
        status: 'active',
        metadata: {},
        metadataObject: {
          repositoryRoot: '/models/workspace-1',
          evidenceRoot: '/models/workspace-1/.evidence',
        },
        created_at: timestamp.toISOString(),
        updated_at: timestamp.toISOString(),
        deleted_at: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      },
    ],
    members: [
      {
        id: 'owner-1',
        workspace_id: 'workspace-1',
        user_id: 'user-1',
        role: 'owner',
        created_at: timestamp.toISOString(),
        updated_at: timestamp.toISOString(),
      },
    ],
    entities: [
      {
        id: 'order',
        workspace_id: 'workspace-1',
        type: 'EVIDENCE',
        sub_type: 'EVIDENCE:other_evidence',
        name: 'Order',
        label: null,
        definition: {},
        description: 'An order',
        attributes: [],
        created_at: timestamp.toISOString(),
        updated_at: timestamp.toISOString(),
        deleted_at: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      },
      {
        id: 'customer',
        workspace_id: 'workspace-1',
        type: 'PARTICIPANT',
        sub_type: 'PARTICIPANT:party',
        name: 'Customer',
        label: null,
        definition: {},
        description: null,
        attributes: [],
        created_at: timestamp.toISOString(),
        updated_at: timestamp.toISOString(),
        deleted_at: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      },
    ],
    relationships: [
      {
        id: 'order_customer',
        workspace_id: 'workspace-1',
        source_id: 'order',
        target_id: 'customer',
        label: 'belongs to',
        deleted_at: null,
        deletedAt: null,
      },
    ],
    retiredDiagramRows: {
      diagrams: 1,
      diagram_nodes: 2,
      diagram_edges: 1,
    },
  } as MigrationData;
}
