export interface Link {
  href: string;
}

export function link(href: string): Link {
  return { href };
}

export function apiHref(): string {
  return '/api';
}

export function healthHref(): string {
  return '/health';
}

export function userHref(userId: string): string {
  return `/api/users/${userId}`;
}

export function userWorkspacesHref(userId: string): string {
  return `/api/users/${userId}/workspaces`;
}

export function userSidebarHref(userId: string): string {
  return `/api/users/${userId}/sidebar`;
}

export function userWorkspacesPageHref(
  userId: string,
  page: number,
  pageSize: number,
): string {
  return `${userWorkspacesHref(userId)}?page=${page}&pageSize=${pageSize}`;
}

export function workspaceHref(userId: string, workspaceId: string): string {
  return `/api/users/${userId}/workspaces/${workspaceId}`;
}

export function workspaceMembersHref(
  userId: string,
  workspaceId: string,
): string {
  return `${workspaceHref(userId, workspaceId)}/members`;
}

export function workspaceDiagramHref(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/diagram`;
}

export function workspaceLogicalEntitiesHref(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/logical-entities`;
}

export function workspaceLogicalRelationshipsHref(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/logical-relationships`;
}

export function workspaceDiagramNodesHref(workspaceId: string): string {
  return `${workspaceDiagramHref(workspaceId)}/nodes`;
}

export function workspaceDiagramNodeHref(
  workspaceId: string,
  nodeId: string,
): string {
  return `${workspaceDiagramNodesHref(workspaceId)}/${nodeId}`;
}

export function workspaceDiagramEdgesHref(workspaceId: string): string {
  return `${workspaceDiagramHref(workspaceId)}/edges`;
}

export function workspaceDiagramEdgeHref(
  workspaceId: string,
  edgeId: string,
): string {
  return `${workspaceDiagramEdgesHref(workspaceId)}/${edgeId}`;
}

export function workspaceDiagramProposeModelHref(workspaceId: string): string {
  return `${workspaceDiagramHref(workspaceId)}/propose-model`;
}

export function workspaceLogicalEntityHref(
  workspaceId: string,
  entityId: string,
): string {
  return `${workspaceLogicalEntitiesHref(workspaceId)}/${entityId}`;
}

export function workspaceLogicalRelationshipHref(
  workspaceId: string,
  relationshipId: string,
): string {
  return `${workspaceLogicalRelationshipsHref(workspaceId)}/${relationshipId}`;
}

export function workspaceMemberHref(
  userId: string,
  workspaceId: string,
  memberId: string,
): string {
  return `${workspaceMembersHref(userId, workspaceId)}/${memberId}`;
}
