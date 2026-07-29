import { DomainError } from '../error';

export const WORKSPACE_ROLES = ['owner', 'member', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type WorkspacePermission = 'read' | 'write' | 'manage';

const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly WorkspacePermission[]> =
  {
    owner: ['read', 'write', 'manage'],
    member: ['read', 'write'],
    viewer: ['read'],
  };

export function workspaceRole(
  value: string,
  defaultRole?: WorkspaceRole,
): WorkspaceRole {
  const normalized = value.trim().toLowerCase() || defaultRole;
  if (isWorkspaceRole(normalized)) return normalized;
  throw DomainError.validation(`unsupported workspace role: ${value}`);
}

export function workspaceRoleAllows(
  role: string,
  permission: WorkspacePermission,
): boolean {
  return isWorkspaceRole(role) && ROLE_PERMISSIONS[role].includes(permission);
}

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === 'string' &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}
