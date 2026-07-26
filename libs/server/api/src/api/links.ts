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

export function userMembershipsHref(userId: string): string {
  return `/api/users/${userId}/memberships`;
}

export function userSidebarHref(userId: string): string {
  return `/api/users/${userId}/sidebar`;
}

export function userMembershipsPageHref(
  userId: string,
  page: number,
  pageSize: number,
): string {
  return `${userMembershipsHref(userId)}?page=${page}&pageSize=${pageSize}`;
}

export function workspacesHref(): string {
  return '/api/workspaces';
}

export function workspaceHref(workspaceId: string): string {
  return `${workspacesHref()}/${workspaceId}`;
}

export function workspaceMembersHref(workspaceId: string): string {
  return `${workspaceHref(workspaceId)}/members`;
}

export function workspaceDiagramHref(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/diagram`;
}

export function workspaceInboxItemsHref(workspaceId: string): string {
  return `${workspaceHref(workspaceId)}/inbox-items`;
}

export function workspaceInboxItemHref(
  workspaceId: string,
  itemId: string,
): string {
  return `${workspaceInboxItemsHref(workspaceId)}/${itemId}`;
}

export function workspaceInboxRevisionsHref(
  workspaceId: string,
  itemId: string,
): string {
  return `${workspaceInboxItemHref(workspaceId, itemId)}/revisions`;
}

export function workspaceInboxRevisionHref(
  workspaceId: string,
  itemId: string,
  revisionId: string,
): string {
  return `${workspaceInboxRevisionsHref(workspaceId, itemId)}/${revisionId}`;
}

export function workspaceInboxExtractionsHref(workspaceId: string): string {
  return `${workspaceHref(workspaceId)}/inbox-extractions`;
}

export function workspaceInboxExtractionHref(
  workspaceId: string,
  extractionId: string,
): string {
  return `${workspaceInboxExtractionsHref(workspaceId)}/${extractionId}`;
}

export function workspaceInboxExtractionCandidatesHref(
  workspaceId: string,
  extractionId: string,
): string {
  return `${workspaceInboxExtractionHref(workspaceId, extractionId)}/candidates`;
}

export function workspaceStoryCandidatesHref(workspaceId: string): string {
  return `${workspaceHref(workspaceId)}/story-candidates`;
}

export function workspaceStoryCandidateHref(
  workspaceId: string,
  candidateId: string,
): string {
  return `${workspaceStoryCandidatesHref(workspaceId)}/${candidateId}`;
}

export function workspaceStoryCandidateDeferHref(
  workspaceId: string,
  candidateId: string,
): string {
  return `${workspaceStoryCandidateHref(workspaceId, candidateId)}/defer`;
}

export function workspaceStoryCandidateSelectHref(
  workspaceId: string,
  candidateId: string,
): string {
  return `${workspaceStoryCandidateHref(workspaceId, candidateId)}/select`;
}

export function workspaceStoryCandidateRejectHref(
  workspaceId: string,
  candidateId: string,
): string {
  return `${workspaceStoryCandidateHref(workspaceId, candidateId)}/reject`;
}

export function workspaceIterationsHref(workspaceId: string): string {
  return `${workspaceHref(workspaceId)}/iterations`;
}

export function workspaceIterationHref(
  workspaceId: string,
  iterationId: string,
): string {
  return `${workspaceIterationsHref(workspaceId)}/${iterationId}`;
}

export function workspaceIterationIntakeHref(
  workspaceId: string,
  iterationId: string,
): string {
  return `${workspaceIterationHref(workspaceId, iterationId)}/intake`;
}

export function workspaceIterationKickoffHref(
  workspaceId: string,
  iterationId: string,
): string {
  return `${workspaceIterationHref(workspaceId, iterationId)}/kickoff`;
}

export function workspaceIterationProvisioningHref(
  workspaceId: string,
  iterationId: string,
  outcome: 'complete' | 'fail',
): string {
  return `${workspaceIterationHref(workspaceId, iterationId)}/provisioning/${outcome}`;
}

export function workspaceIterationKickoffProposalsHref(
  workspaceId: string,
  iterationId: string,
): string {
  return `${workspaceIterationKickoffHref(workspaceId, iterationId)}/proposals`;
}

export function workspaceIterationKickoffDecisionsHref(
  workspaceId: string,
  iterationId: string,
): string {
  return `${workspaceIterationKickoffHref(workspaceId, iterationId)}/decisions`;
}

export function workspaceStoriesHref(workspaceId: string): string {
  return `${workspaceHref(workspaceId)}/stories`;
}

export function workspaceStoryHref(
  workspaceId: string,
  storyId: string,
): string {
  return `${workspaceStoriesHref(workspaceId)}/${storyId}`;
}

export function workspaceStoryRevisionsHref(
  workspaceId: string,
  storyId: string,
): string {
  return `${workspaceStoryHref(workspaceId, storyId)}/revisions`;
}

export function workspaceStoryRevisionHref(
  workspaceId: string,
  storyId: string,
  revisionId: string,
): string {
  return `${workspaceStoryRevisionsHref(workspaceId, storyId)}/${revisionId}`;
}

export function workspaceStoryCodingRunsHref(
  workspaceId: string,
  storyId: string,
): string {
  return `${workspaceStoryHref(workspaceId, storyId)}/coding-runs`;
}

export function workspaceCodingRunsHref(workspaceId: string): string {
  return `${workspaceHref(workspaceId)}/coding-runs`;
}

export function workspaceCodingRunHref(
  workspaceId: string,
  runId: string,
): string {
  return `${workspaceCodingRunsHref(workspaceId)}/${runId}`;
}

export function workspaceCodingRunCommandHref(
  workspaceId: string,
  runId: string,
  command: 'review' | 'fail' | 'cancel' | 'accept' | 'reject',
): string {
  return `${workspaceCodingRunHref(workspaceId, runId)}/${command}`;
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
  workspaceId: string,
  memberId: string,
): string {
  return `${workspaceMembersHref(workspaceId)}/${memberId}`;
}
