import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentPrincipal } from '@evidence/server-api';
import {
  USERS,
  type ExternalUserIdentity,
  type Users,
} from '@evidence/server-domain';
import {
  authenticationMode,
  isLoopbackHost,
  oidcAutoProvision,
  oidcConfiguration,
} from './authentication-config';
import { OidcTokenVerifier } from './oidc-token-verifier';

@Injectable()
export class ApiAuthorizationGuard implements CanActivate {
  constructor(
    @Inject(USERS) private readonly users: Users,
    private readonly principal: CurrentPrincipal,
    private readonly oidcTokens: OidcTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    if (requestPath(request) === '/health') return true;

    if (authenticationMode() === 'oidc') {
      await this.authenticateOidc(request);
    } else {
      this.authenticateLocal(request);
    }
    return true;
  }

  private authenticateLocal(request: HttpRequest): void {
    const expected = configuredAuthorization();
    if (expected) {
      const actual = firstHeader(request.headers.authorization);
      if (!actual || !constantTimeEqual(actual, expected)) {
        throw authenticationFailed();
      }
    }
    this.principal.establish({
      userId: currentUserId(),
      authentication: 'local',
    });
  }

  private async authenticateOidc(request: HttpRequest): Promise<void> {
    const token = bearerToken(firstHeader(request.headers.authorization));
    let identity: ExternalUserIdentity;
    try {
      identity = await this.oidcTokens.verify(token);
    } catch {
      throw authenticationFailed();
    }

    let user = await this.users.findByExternalIdentity(identity);
    if (!user && oidcAutoProvision()) {
      user = await this.users.provisionExternalIdentity(identity);
    }
    if (!user) throw authenticationFailed();

    this.principal.establish({
      userId: user.identity(),
      authentication: 'oidc',
      issuer: identity.issuer,
      subject: identity.subject,
    });
  }
}

export function assertRemoteApiIsSecured(
  host: string,
  authorization = process.env.EVIDENCE_API_AUTHORIZATION,
): void {
  if (authenticationMode() === 'oidc') {
    oidcConfiguration();
    oidcAutoProvision();
    return;
  }
  if (isLoopbackHost(host)) return;
  if (!normalizeAuthorization(authorization)) {
    throw new Error(
      'EVIDENCE_API_AUTHORIZATION is required when EVIDENCE_HOST is not loopback.',
    );
  }
}

export function currentUserId(value = process.env.EVIDENCE_USER_ID): string {
  const normalized = value?.trim() || 'desktop-user';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(normalized)) {
    throw new Error('EVIDENCE_USER_ID contains unsupported characters.');
  }
  return normalized;
}

function configuredAuthorization(): string | null {
  return normalizeAuthorization(process.env.EVIDENCE_API_AUTHORIZATION);
}

function normalizeAuthorization(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (/\r|\n/.test(normalized) || normalized.length > 4_096) {
    throw new Error('EVIDENCE_API_AUTHORIZATION is invalid.');
  }
  return normalized;
}

function bearerToken(value: string | undefined): string {
  const match = value?.match(/^Bearer ([^\s]+)$/i);
  if (!match?.[1] || match[1].length > 16_384) throw authenticationFailed();
  return match[1];
}

function requestPath(request: HttpRequest): string {
  return (request.path || request.originalUrl || '').split('?')[0] || '';
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function authenticationFailed(): UnauthorizedException {
  return new UnauthorizedException('Evidence API authentication failed.');
}

interface HttpRequest {
  path?: string;
  originalUrl?: string;
  headers: { authorization?: string | string[] };
}
