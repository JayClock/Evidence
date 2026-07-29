import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CurrentPrincipal } from '@evidence/server-api';
import { ApiAuthorizationGuard } from './api-authorization.guard';
import { OidcTokenVerifier } from './oidc-token-verifier';

@Global()
@Module({
  providers: [
    CurrentPrincipal,
    OidcTokenVerifier,
    {
      provide: APP_GUARD,
      useClass: ApiAuthorizationGuard,
    },
  ],
  exports: [CurrentPrincipal],
})
export class AuthenticationModule {}
