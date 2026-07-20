import { Global, Module } from '@nestjs/common';
import { USERS } from '@evidence/server-domain';
import {
  SqliteRegistry,
  SqliteUsers,
} from '@evidence/server-persistent/sqlite';

@Global()
@Module({
  providers: [
    SqliteRegistry,
    {
      provide: USERS,
      useClass: SqliteUsers,
    },
  ],
  exports: [USERS],
})
export class SqlitePersistenceModule {}
