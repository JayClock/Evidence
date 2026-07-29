import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CurrentPrincipal } from '@evidence/server-api';
import { ApiAuthorizationGuard } from './api-authorization.guard';
import { OidcTokenVerifier } from './oidc-token-verifier';
import { WorkspaceAuthorizationGuard } from './workspace-authorization.guard';

@Global()
@Module({
  providers: [
    CurrentPrincipal,
    OidcTokenVerifier,
    {
      provide: APP_GUARD,
      useClass: ApiAuthorizationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: WorkspaceAuthorizationGuard,
    },
  ],
  exports: [CurrentPrincipal],
})
export class AuthenticationModule {}
