const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

export function selectMigrationDatabaseUrl(
  explicitEnvironment,
  fileEnvironment = {},
) {
  const candidates = [
    explicitEnvironment.EVIDENCE_MIGRATION_DATABASE_URL,
    explicitEnvironment.DIRECT_URL,
    explicitEnvironment.DATABASE_URL,
    fileEnvironment.EVIDENCE_MIGRATION_DATABASE_URL,
    fileEnvironment.DIRECT_URL,
    fileEnvironment.DATABASE_URL,
  ];
  const selected = candidates.find((value) => value?.trim())?.trim();
  if (!selected) {
    throw new Error(
      'Set EVIDENCE_MIGRATION_DATABASE_URL, DIRECT_URL, or DATABASE_URL before deploying migrations.',
    );
  }

  let url;
  try {
    url = new URL(selected);
  } catch {
    throw new Error('The selected Prisma migration URL is not a valid URL.');
  }
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new Error('The selected Prisma migration URL must use PostgreSQL.');
  }
  return selected;
}

export function migrationTargetLabel(value) {
  const url = new URL(value);
  const database = url.pathname.replace(/^\/+/, '') || '(default database)';
  const port = url.port ? `:${url.port}` : '';
  return `${url.hostname}${port}/${database}`;
}
