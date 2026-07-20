import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

const VENDOR_PREFIX = 'application/vnd.evidence';

@Injectable()
export class VendorMediaTypeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ method?: string; path?: string; url?: string }>();
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>();
    const contentType = vendorMediaType(
      request.method ?? 'GET',
      request.path ?? request.url ?? '',
    );
    if (contentType) {
      response.setHeader('Content-Type', contentType);
    }
    return next.handle();
  }
}

export function vendorMediaType(
  method: string,
  requestPath: string,
): string | null {
  const path = requestPath.split('?')[0] ?? '';
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0 || segments.join('/') === 'api') {
    return mediaType('root');
  }
  if (segments.join('/') === 'health') {
    return mediaType('health');
  }
  if (segments[0] !== 'api') {
    return null;
  }

  const apiSegments = segments.slice(1);
  if (matches(apiSegments, ['users', '*'])) return mediaType('user');
  if (matches(apiSegments, ['users', '*', 'sidebar'])) {
    return mediaType('sidebar');
  }
  if (matches(apiSegments, ['users', '*', 'workspaces'])) {
    return mediaType('workspaces');
  }
  if (matches(apiSegments, ['users', '*', 'workspaces', '*'])) {
    return mediaType('workspace');
  }
  if (matches(apiSegments, ['users', '*', 'workspaces', '*', 'members'])) {
    return mediaType('members');
  }
  if (matches(apiSegments, ['users', '*', 'workspaces', '*', 'members', '*'])) {
    return mediaType('member');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram'])) {
    return mediaType('diagram');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram', 'nodes'])) {
    return mediaType('nodes');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram', 'nodes', '*'])) {
    return mediaType('node');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram', 'edges'])) {
    return mediaType('edges');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram', 'edges', '*'])) {
    return mediaType('edge');
  }
  if (matches(apiSegments, ['workspaces', '*', 'diagram', 'propose-model'])) {
    return method.toUpperCase() === 'GET' ? mediaType('diagram') : null;
  }
  if (matches(apiSegments, ['workspaces', '*', 'logical-entities'])) {
    return mediaType('logical-entities');
  }
  if (matches(apiSegments, ['workspaces', '*', 'logical-entities', '*'])) {
    return mediaType('logical-entity');
  }
  if (matches(apiSegments, ['workspaces', '*', 'logical-relationships'])) {
    return mediaType('logical-relationships');
  }
  if (matches(apiSegments, ['workspaces', '*', 'logical-relationships', '*'])) {
    return mediaType('logical-relationship');
  }
  return null;
}

function matches(actual: string[], pattern: string[]): boolean {
  return (
    actual.length === pattern.length &&
    pattern.every(
      (segment, index) => segment === '*' || segment === actual[index],
    )
  );
}

function mediaType(resource: string): string {
  return `${VENDOR_PREFIX}.${resource}+json`;
}
