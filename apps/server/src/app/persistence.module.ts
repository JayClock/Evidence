import { Global, Module } from '@nestjs/common';
import { USERS } from '@evidence/server-domain';
import { PrismaService, PrismaUsers } from '@evidence/server-persistent';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: USERS,
      useClass: PrismaUsers,
    },
  ],
  exports: [USERS],
})
export class PersistenceModule {}
