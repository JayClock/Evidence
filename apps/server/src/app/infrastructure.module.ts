import { Global, Module } from '@nestjs/common';
import { DOMAIN_ARCHITECT } from '@evidence/server-domain';
import { PiRpcDomainArchitect } from '@evidence/server-infrastructure';

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
