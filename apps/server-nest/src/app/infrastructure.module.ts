import { Global, Module } from '@nestjs/common';
import { DOMAIN_ARCHITECT } from '@evidence/server-nest-domain';
import { PiRpcDomainArchitect } from '@evidence/server-nest-infrastructure';

@Global()
@Module({
  providers: [
    {
      provide: DOMAIN_ARCHITECT,
      useClass: PiRpcDomainArchitect,
    },
  ],
  exports: [DOMAIN_ARCHITECT],
})
export class InfrastructureModule {}
