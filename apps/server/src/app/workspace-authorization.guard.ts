import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CurrentPrincipal } from '@evidence/server-api';
import {
  DomainError,
  USERS,
  workspaceRoleAllows,
  type Users,
  type WorkspacePermission,
} from '@evidence/server-domain';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class WorkspaceAuthorizationGuard implements CanActivate {
  constructor(
    @Inject(USERS) private readonly users: Users,
    private readonly principal: CurrentPrincipal,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const workspaceId = request.params?.workspaceId;
    if (!workspaceId) return true;

    const { userId } = this.principal.require();
    const membership = await this.users
      .memberships(userId)
      .findByWorkspaceIdentity(workspaceId);
    if (!membership) {
      throw DomainError.notFound(`workspace ${workspaceId} not found`);
    }

    const permission = requiredPermission(request);
    if (
      !workspaceRoleAllows(membership.member.description().role, permission)
    ) {
      throw DomainError.forbidden(
        `workspace ${workspaceId} does not allow ${permission} access`,
      );
    }
    return true;
  }
}

function requiredPermission(request: WorkspaceRequest): WorkspacePermission {
  if (READ_METHODS.has(request.method.toUpperCase())) return 'read';

  const segments = requestPath(request).split('/').filter(Boolean);
  const workspaceIndex = segments.lastIndexOf('workspaces');
  const nestedResource =
    workspaceIndex >= 0 ? segments[workspaceIndex + 2] : undefined;
  if (!nestedResource || nestedResource === 'members') return 'manage';
  return 'write';
}

function requestPath(request: WorkspaceRequest): string {
  return (request.path || request.originalUrl || '').split('?')[0] || '';
}

interface WorkspaceRequest {
  method: string;
  path?: string;
  originalUrl?: string;
  params?: { workspaceId?: string };
}
