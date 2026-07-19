import { DynamicModule, Global, Module, type Provider } from '@nestjs/common';
import { USERS } from '@evidence/server-nest-domain';
import {
  PrismaService,
  PrismaUsers,
  SqliteRegistry,
  SqliteUsers,
} from '@evidence/server-nest-persistent';

export type EvidenceStorage = 'postgres' | 'sqlite';

export function resolveStorage(
  configured = process.env.EVIDENCE_STORAGE,
): EvidenceStorage {
  if (!configured || configured === 'postgres') {
    return 'postgres';
  }
  if (configured === 'sqlite') {
    return 'sqlite';
  }
  throw new Error(
    `EVIDENCE_STORAGE must be "postgres" or "sqlite", received "${configured}".`,
  );
}

function storageProviders(storage: EvidenceStorage): Provider[] {
  if (storage === 'sqlite') {
    return [
      SqliteRegistry,
      {
        provide: USERS,
        useClass: SqliteUsers,
      },
    ];
  }

  return [
    PrismaService,
    {
      provide: USERS,
      useClass: PrismaUsers,
    },
  ];
}

@Global()
@Module({})
export class PersistenceModule {
  static forRoot(storage = resolveStorage()): DynamicModule {
    const providers = storageProviders(storage);
    return {
      module: PersistenceModule,
      providers,
      exports: [USERS],
    };
  }
}
