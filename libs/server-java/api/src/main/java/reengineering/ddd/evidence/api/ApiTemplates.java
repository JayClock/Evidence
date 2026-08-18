package reengineering.ddd.evidence.api;

import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;

public final class ApiTemplates {
  private ApiTemplates() {}

  public static URI root(UriInfo uriInfo) {
    return endpoint(uriInfo, RootApi.class, "root");
  }

  public static URI health(UriInfo uriInfo) {
    return endpoint(uriInfo, RootApi.class, "health");
  }

  public static URI currentUser(UriInfo uriInfo, String userId) {
    return user(uriInfo, userId);
  }

  public static URI user(UriInfo uriInfo, String userId) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "users")
        .path(UsersApi.class, "findById")
        .build(userId);
  }

  public static URI userMemberships(UriInfo uriInfo, String userId) {
    return userBuilder(uriInfo).path(UserApi.class, "memberships").build(userId);
  }

  public static URI userMembershipsPage(UriInfo uriInfo, String userId, int page, int pageSize) {
    return UriBuilder.fromUri(userMemberships(uriInfo, userId))
        .queryParam("page", page)
        .queryParam("pageSize", pageSize)
        .build();
  }

  public static URI userSidebar(UriInfo uriInfo, String userId) {
    return userBuilder(uriInfo).path(UserApi.class, "sidebar").build(userId);
  }

  public static URI workspaces(UriInfo uriInfo) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "workspaces")
        .build();
  }

  public static URI workspace(UriInfo uriInfo, String workspaceId) {
    return workspaceBuilder(uriInfo).build(workspaceId);
  }

  public static URI workspaceMemberships(UriInfo uriInfo, String workspaceId) {
    return workspaceBuilder(uriInfo).path(WorkspaceApi.class, "memberships").build(workspaceId);
  }

  public static URI workspaceMembership(UriInfo uriInfo, String workspaceId, String membershipId) {
    return workspaceBuilder(uriInfo)
        .path(WorkspaceApi.class, "memberships")
        .path(WorkspaceMembershipsApi.class, "findById")
        .build(workspaceId, membershipId);
  }

  public static URI workspaceChild(UriInfo uriInfo, String workspaceId, String child) {
    return workspaceBuilder(uriInfo).path(child).build(workspaceId);
  }

  public static URI workspaceInboxItems(UriInfo uriInfo, String workspaceId) {
    return workspaceChild(uriInfo, workspaceId, "inbox-items");
  }

  public static URI workspaceInboxItemsPage(
      UriInfo uriInfo,
      String workspaceId,
      int page,
      int pageSize,
      String status,
      String sourceKind,
      String query) {
    UriBuilder builder =
        UriBuilder.fromUri(workspaceInboxItems(uriInfo, workspaceId))
            .queryParam("page", page)
            .queryParam("pageSize", pageSize);
    if (status != null) builder.queryParam("status", status);
    if (sourceKind != null) builder.queryParam("sourceKind", sourceKind);
    if (query != null) builder.queryParam("q", query);
    return builder.build();
  }

  public static URI workspaceInboxItem(UriInfo uriInfo, String workspaceId, String itemId) {
    return UriBuilder.fromUri(workspaceInboxItems(uriInfo, workspaceId))
        .path("{itemId}")
        .build(itemId);
  }

  public static URI workspaceInboxRevisions(UriInfo uriInfo, String workspaceId, String itemId) {
    return UriBuilder.fromUri(workspaceInboxItem(uriInfo, workspaceId, itemId))
        .path("revisions")
        .build();
  }

  public static URI workspaceInboxRevision(
      UriInfo uriInfo, String workspaceId, String itemId, String revisionId) {
    return UriBuilder.fromUri(workspaceInboxRevisions(uriInfo, workspaceId, itemId))
        .path("{revisionId}")
        .build(revisionId);
  }

  public static URI workspaceInboxExtractions(UriInfo uriInfo, String workspaceId) {
    return workspaceChild(uriInfo, workspaceId, "inbox-extractions");
  }

  public static URI workspaceInboxExtraction(
      UriInfo uriInfo, String workspaceId, String extractionId) {
    return UriBuilder.fromUri(workspaceInboxExtractions(uriInfo, workspaceId))
        .path("{extractionId}")
        .build(extractionId);
  }

  public static URI workspaceInboxExtractionCandidates(
      UriInfo uriInfo, String workspaceId, String extractionId) {
    return UriBuilder.fromUri(workspaceInboxExtraction(uriInfo, workspaceId, extractionId))
        .path("candidates")
        .build();
  }

  public static URI workspaceStoryCandidates(UriInfo uriInfo, String workspaceId) {
    return workspaceChild(uriInfo, workspaceId, "story-candidates");
  }

  public static URI workspaceStoryCandidatesPage(
      UriInfo uriInfo,
      String workspaceId,
      int page,
      int pageSize,
      String status,
      String extractionId,
      String query) {
    UriBuilder builder =
        UriBuilder.fromUri(workspaceStoryCandidates(uriInfo, workspaceId))
            .queryParam("page", page)
            .queryParam("pageSize", pageSize);
    if (status != null) builder.queryParam("status", status);
    if (extractionId != null) builder.queryParam("extractionId", extractionId);
    if (query != null) builder.queryParam("q", query);
    return builder.build();
  }

  public static URI workspaceExtractionStoryCandidates(
      UriInfo uriInfo, String workspaceId, String extractionId) {
    return UriBuilder.fromUri(workspaceStoryCandidates(uriInfo, workspaceId))
        .queryParam("extractionId", extractionId)
        .build();
  }

  public static URI workspaceStoryCandidate(
      UriInfo uriInfo, String workspaceId, String candidateId) {
    return UriBuilder.fromUri(workspaceStoryCandidates(uriInfo, workspaceId))
        .path("{candidateId}")
        .build(candidateId);
  }

  public static URI workspaceStoryCandidateAction(
      UriInfo uriInfo, String workspaceId, String candidateId, String action) {
    return UriBuilder.fromUri(workspaceStoryCandidate(uriInfo, workspaceId, candidateId))
        .path(action)
        .build();
  }

  public static URI workspaceIterations(UriInfo uriInfo, String workspaceId) {
    return workspaceChild(uriInfo, workspaceId, "iterations");
  }

  public static URI workspaceIteration(UriInfo uriInfo, String workspaceId, String iterationId) {
    return UriBuilder.fromUri(workspaceIterations(uriInfo, workspaceId))
        .path("{iterationId}")
        .build(iterationId);
  }

  public static URI workspaceIterationChild(
      UriInfo uriInfo, String workspaceId, String iterationId, String child) {
    return UriBuilder.fromUri(workspaceIteration(uriInfo, workspaceId, iterationId))
        .path(child)
        .build();
  }

  public static URI workspaceKickoffProposal(
      UriInfo uriInfo, String workspaceId, String iterationId, String proposalId) {
    return UriBuilder.fromUri(
            workspaceIterationChild(uriInfo, workspaceId, iterationId, "kickoff/proposals"))
        .path("{proposalId}")
        .build(proposalId);
  }

  public static URI workspaceKickoffDecision(
      UriInfo uriInfo, String workspaceId, String iterationId, String decisionId) {
    return UriBuilder.fromUri(
            workspaceIterationChild(uriInfo, workspaceId, iterationId, "kickoff/decisions"))
        .path("{decisionId}")
        .build(decisionId);
  }

  public static URI workspaceStories(UriInfo uriInfo, String workspaceId) {
    return workspaceChild(uriInfo, workspaceId, "stories");
  }

  public static URI workspaceStoriesPage(
      UriInfo uriInfo, String workspaceId, int page, int pageSize) {
    return UriBuilder.fromUri(workspaceStories(uriInfo, workspaceId))
        .queryParam("page", page)
        .queryParam("pageSize", pageSize)
        .build();
  }

  public static URI workspaceStory(UriInfo uriInfo, String workspaceId, String storyId) {
    return UriBuilder.fromUri(workspaceStories(uriInfo, workspaceId))
        .path("{storyId}")
        .build(storyId);
  }

  public static URI workspaceStoryRevisions(UriInfo uriInfo, String workspaceId, String storyId) {
    return UriBuilder.fromUri(workspaceStory(uriInfo, workspaceId, storyId))
        .path("revisions")
        .build();
  }

  public static URI workspaceStoryRevisionsPage(
      UriInfo uriInfo, String workspaceId, String storyId, int page, int pageSize) {
    return UriBuilder.fromUri(workspaceStoryRevisions(uriInfo, workspaceId, storyId))
        .queryParam("page", page)
        .queryParam("pageSize", pageSize)
        .build();
  }

  public static URI workspaceStoryRevision(
      UriInfo uriInfo, String workspaceId, String storyId, String revisionId) {
    return UriBuilder.fromUri(workspaceStoryRevisions(uriInfo, workspaceId, storyId))
        .path("{revisionId}")
        .build(revisionId);
  }

  public static URI workspaceDiagram(UriInfo uriInfo, String workspaceId) {
    return workspaceChild(uriInfo, workspaceId, "diagram");
  }

  public static URI workspaceDiagramNodes(UriInfo uriInfo, String workspaceId) {
    return UriBuilder.fromUri(workspaceDiagram(uriInfo, workspaceId)).path("nodes").build();
  }

  public static URI workspaceDiagramNode(UriInfo uriInfo, String workspaceId, String nodeId) {
    return UriBuilder.fromUri(workspaceDiagramNodes(uriInfo, workspaceId))
        .path("{nodeId}")
        .build(nodeId);
  }

  public static URI workspaceDiagramEdges(UriInfo uriInfo, String workspaceId) {
    return UriBuilder.fromUri(workspaceDiagram(uriInfo, workspaceId)).path("edges").build();
  }

  public static URI workspaceDiagramEdge(UriInfo uriInfo, String workspaceId, String edgeId) {
    return UriBuilder.fromUri(workspaceDiagramEdges(uriInfo, workspaceId))
        .path("{edgeId}")
        .build(edgeId);
  }

  public static URI workspaceLogicalEntities(UriInfo uriInfo, String workspaceId) {
    return workspaceChild(uriInfo, workspaceId, "logical-entities");
  }

  public static URI workspaceLogicalEntitiesPage(
      UriInfo uriInfo, String workspaceId, int page, int pageSize) {
    return UriBuilder.fromUri(workspaceLogicalEntities(uriInfo, workspaceId))
        .queryParam("page", page)
        .queryParam("pageSize", pageSize)
        .build();
  }

  public static URI workspaceLogicalEntity(UriInfo uriInfo, String workspaceId, String entityId) {
    return UriBuilder.fromUri(workspaceLogicalEntities(uriInfo, workspaceId))
        .path("{entityId}")
        .build(entityId);
  }

  public static URI workspaceLogicalRelationships(UriInfo uriInfo, String workspaceId) {
    return workspaceChild(uriInfo, workspaceId, "logical-relationships");
  }

  public static URI workspaceLogicalRelationshipsPage(
      UriInfo uriInfo, String workspaceId, int page, int pageSize) {
    return UriBuilder.fromUri(workspaceLogicalRelationships(uriInfo, workspaceId))
        .queryParam("page", page)
        .queryParam("pageSize", pageSize)
        .build();
  }

  public static URI workspaceLogicalRelationship(
      UriInfo uriInfo, String workspaceId, String relationshipId) {
    return UriBuilder.fromUri(workspaceLogicalRelationships(uriInfo, workspaceId))
        .path("{relationshipId}")
        .build(relationshipId);
  }

  public static URI workspaceMembershipsPage(
      UriInfo uriInfo, String workspaceId, int page, int pageSize) {
    return UriBuilder.fromUri(workspaceMemberships(uriInfo, workspaceId))
        .queryParam("page", page)
        .queryParam("pageSize", pageSize)
        .build();
  }

  private static URI endpoint(UriInfo uriInfo, Class<?> resourceType, String methodName) {
    return uriInfo.getBaseUriBuilder().path(resourceType).path(resourceType, methodName).build();
  }

  private static UriBuilder userBuilder(UriInfo uriInfo) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "users")
        .path(UsersApi.class, "findById");
  }

  private static UriBuilder workspaceBuilder(UriInfo uriInfo) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "workspaces")
        .path(WorkspacesApi.class, "findById");
  }
}
