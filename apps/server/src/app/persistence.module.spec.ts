import { describe, expect, it } from 'vitest';
import { resolveStorage } from './persistence.module';

describe('server persistence selection', () => {
  it('uses PostgreSQL by default', () => {
    expect(resolveStorage(undefined)).toBe('postgres');
    expect(resolveStorage('postgres')).toBe('postgres');
  });

  it('selects SQLite explicitly for desktop', () => {
    expect(resolveStorage('sqlite')).toBe('sqlite');
  });

  it('rejects unknown storage adapters', () => {
    expect(() => resolveStorage('memory')).toThrow(
      /EVIDENCE_STORAGE must be "postgres" or "sqlite"/,
    );
  });
});
