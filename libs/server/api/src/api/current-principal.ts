import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';

export interface AuthenticatedPrincipal {
  userId: string;
  authentication: 'local' | 'oidc';
  issuer?: string;
  subject?: string;
}

@Injectable({ scope: Scope.REQUEST })
export class CurrentPrincipal {
  private principal: AuthenticatedPrincipal | null = null;

  establish(principal: AuthenticatedPrincipal): void {
    if (this.principal && this.principal.userId !== principal.userId) {
      throw new Error('The request principal cannot be replaced.');
    }
    this.principal = principal;
  }

  require(): AuthenticatedPrincipal {
    if (!this.principal) {
      throw new UnauthorizedException('Evidence API authentication required.');
    }
    return this.principal;
  }
}
