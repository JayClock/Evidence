import { describe, expect, it } from 'vitest';
import {
  migrationTargetLabel,
  selectMigrationDatabaseUrl,
} from './prisma-target.mjs';

const temporary = 'postgresql://postgres:secret@127.0.0.1:55432/evidence_test';
const configured = 'postgresql://postgres:secret@db.example.com:5432/evidence';

describe('Prisma migration target selection', () => {
  it('prefers an explicit migration URL', () => {
    expect(
      selectMigrationDatabaseUrl(
        {
          EVIDENCE_MIGRATION_DATABASE_URL: temporary,
          DIRECT_URL: configured,
          DATABASE_URL: configured,
        },
        {},
      ),
    ).toBe(temporary);
  });

  it('keeps an explicit shell DATABASE_URL ahead of file-only DIRECT_URL', () => {
    expect(
      selectMigrationDatabaseUrl(
        { DATABASE_URL: temporary },
        { DIRECT_URL: configured, DATABASE_URL: configured },
      ),
    ).toBe(temporary);
  });

  it('uses a direct URL when both values come from the same environment', () => {
    expect(
      selectMigrationDatabaseUrl(
        { DIRECT_URL: configured, DATABASE_URL: temporary },
        {},
      ),
    ).toBe(configured);
  });

  it('rejects missing and non-PostgreSQL targets', () => {
    expect(() => selectMigrationDatabaseUrl({}, {})).toThrow(
      'Set EVIDENCE_MIGRATION_DATABASE_URL',
    );
    expect(() =>
      selectMigrationDatabaseUrl({ DATABASE_URL: 'file:///tmp/evidence.db' }),
    ).toThrow('must use PostgreSQL');
  });

  it('prints a credential-free target label', () => {
    const label = migrationTargetLabel(temporary);
    expect(label).toBe('127.0.0.1:55432/evidence_test');
    expect(label).not.toContain('secret');
  });
});
