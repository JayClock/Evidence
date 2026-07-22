import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

@Injectable()
export class ApiAuthorizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    if (requestPath(request) === '/health') {
      return true;
    }

    const expected = configuredAuthorization();
    if (!expected) {
      return true;
    }
    const actual = firstHeader(request.headers.authorization);
    if (!actual || !constantTimeEqual(actual, expected)) {
      throw new UnauthorizedException('Evidence API authorization failed.');
    }
    return true;
  }
}

export function assertRemoteApiIsSecured(
  host: string,
  authorization = process.env.EVIDENCE_API_AUTHORIZATION,
): void {
  if (LOOPBACK_HOSTS.has(host.trim().toLowerCase())) {
    return;
  }
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
  if (!normalized) {
    return null;
  }
  if (/\r|\n/.test(normalized) || normalized.length > 4_096) {
    throw new Error('EVIDENCE_API_AUTHORIZATION is invalid.');
  }
  return normalized;
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

interface HttpRequest {
  path?: string;
  originalUrl?: string;
  headers: { authorization?: string | string[] };
}
