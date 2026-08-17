package reengineering.ddd.evidence.api;

import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.Delivery;
import reengineering.ddd.evidence.domain.model.Story;

public final class StoriesApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceService workspaces;

  public StoriesApi(String actorUserId, String workspaceId, WorkspaceService workspaces) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaces = workspaces;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.STORIES)
  public DeliveryModels.StoryCollectionModel list(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    Delivery.Page<Story> stories = workspaces.stories(actorUserId, workspaceId, page, pageSize);
    return new DeliveryModels.StoryCollectionModel(
        workspaceId,
        stories,
        workspaces.storySummary(actorUserId, workspaceId),
        page,
        pageSize,
        uriInfo);
  }

  @GET
  @Path("{storyId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.STORY)
  public DeliveryModels.StoryModel get(
      @PathParam("storyId") String storyId, @Context UriInfo uriInfo) {
    return new DeliveryModels.StoryModel(
        workspaces.requireStory(actorUserId, workspaceId, storyId), uriInfo);
  }

  @GET
  @Path("{storyId}/revisions")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.STORY_REVISIONS)
  public DeliveryModels.RevisionCollectionModel revisions(
      @PathParam("storyId") String storyId,
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    return new DeliveryModels.RevisionCollectionModel(
        workspaceId,
        storyId,
        workspaces.storyRevisions(actorUserId, workspaceId, storyId, page, pageSize),
        page,
        pageSize,
        uriInfo);
  }

  @GET
  @Path("{storyId}/revisions/{revisionId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.STORY_REVISION)
  public DeliveryModels.StoryRevisionModel revision(
      @PathParam("storyId") String storyId,
      @PathParam("revisionId") String revisionId,
      @Context UriInfo uriInfo) {
    return new DeliveryModels.StoryRevisionModel(
        workspaceId,
        workspaces.requireStoryRevision(actorUserId, workspaceId, storyId, revisionId),
        uriInfo);
  }
}
