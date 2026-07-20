import { Global, Module } from '@nestjs/common';
import { DOMAIN_ARCHITECT } from '@evidence/server-domain';
import { PiSdkDomainArchitect } from '@evidence/server-infrastructure';

@Global()
@Module({
  providers: [
    {
      provide: DOMAIN_ARCHITECT,
      useClass: PiSdkDomainArchitect,
    },
  ],
  exports: [DOMAIN_ARCHITECT],
})
export class InfrastructureModule {}
