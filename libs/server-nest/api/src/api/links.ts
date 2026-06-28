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

export function workspaceDiagramsHref(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/diagrams`;
}

export function workspaceLogicalEntitiesHref(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/logical-entities`;
}

export function workspaceLogicalRelationshipsHref(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/logical-relationships`;
}

export function workspaceDiagramHref(
  workspaceId: string,
  diagramId: string,
): string {
  return `${workspaceDiagramsHref(workspaceId)}/${diagramId}`;
}

export function workspaceDiagramNodesHref(
  workspaceId: string,
  diagramId: string,
): string {
  return `${workspaceDiagramHref(workspaceId, diagramId)}/nodes`;
}

export function workspaceDiagramNodeHref(
  workspaceId: string,
  diagramId: string,
  nodeId: string,
): string {
  return `${workspaceDiagramNodesHref(workspaceId, diagramId)}/${nodeId}`;
}

export function workspaceDiagramEdgesHref(
  workspaceId: string,
  diagramId: string,
): string {
  return `${workspaceDiagramHref(workspaceId, diagramId)}/edges`;
}

export function workspaceDiagramEdgeHref(
  workspaceId: string,
  diagramId: string,
  edgeId: string,
): string {
  return `${workspaceDiagramEdgesHref(workspaceId, diagramId)}/${edgeId}`;
}

export function workspaceDiagramProposeModelHref(
  workspaceId: string,
  diagramId: string,
): string {
  return `${workspaceDiagramHref(workspaceId, diagramId)}/propose-model`;
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
