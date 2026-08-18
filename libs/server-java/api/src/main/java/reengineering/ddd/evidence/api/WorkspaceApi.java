package reengineering.ddd.evidence.api;

import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.representation.WorkspaceModel;
import reengineering.ddd.evidence.application.WorkspaceModelService;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Workspace;

public class WorkspaceApi {
  private final String actorUserId;
  private final Workspace workspace;
  private final WorkspaceService workspaceService;
  private final WorkspaceModelService workspaceModelService;

  @Context private ResourceContext resourceContext;

  public WorkspaceApi(
      String actorUserId,
      Workspace workspace,
      WorkspaceService workspaceService,
      WorkspaceModelService workspaceModelService) {
    this.actorUserId = actorUserId;
    this.workspace = workspace;
    this.workspaceService = workspaceService;
    this.workspaceModelService = workspaceModelService;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.WORKSPACE)
  public WorkspaceModel get(@Context UriInfo uriInfo) {
    return new WorkspaceModel(workspace, uriInfo);
  }

  @PUT
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.WORKSPACE)
  public WorkspaceModel update(WorkspaceRequest request, @Context UriInfo uriInfo) {
    if (request == null) throw DomainException.validation("request body is required");
    Workspace updated =
        workspaceService.updateWorkspace(
            actorUserId, workspace.getIdentity(), request.toDescription());
    return new WorkspaceModel(updated, uriInfo);
  }

  @DELETE
  public Response delete() {
    workspaceService.deleteWorkspace(actorUserId, workspace.getIdentity());
    return Response.noContent().build();
  }

  @Path("memberships")
  public WorkspaceMembershipsApi memberships() {
    return resourceContext.initResource(
        new WorkspaceMembershipsApi(actorUserId, workspace.getIdentity(), workspaceService));
  }

  @Path("diagram")
  public DiagramApi diagram() {
    return resourceContext.initResource(
        new DiagramApi(actorUserId, workspace.getIdentity(), workspaceModelService));
  }

  @Path("inbox-items")
  public InboxItemsApi inboxItems() {
    return resourceContext.initResource(
        new InboxItemsApi(actorUserId, workspace.getIdentity(), workspaceService));
  }

  @Path("inbox-extractions")
  public InboxExtractionsApi inboxExtractions() {
    return resourceContext.initResource(
        new InboxExtractionsApi(actorUserId, workspace.getIdentity(), workspaceService));
  }

  @Path("story-candidates")
  public StoryCandidatesApi storyCandidates() {
    return resourceContext.initResource(
        new StoryCandidatesApi(actorUserId, workspace.getIdentity(), workspaceService));
  }

  @Path("iterations")
  public IterationsApi iterations() {
    return resourceContext.initResource(
        new IterationsApi(actorUserId, workspace.getIdentity(), workspaceService));
  }

  @Path("stories")
  public StoriesApi stories() {
    return resourceContext.initResource(
        new StoriesApi(actorUserId, workspace.getIdentity(), workspaceService));
  }

  @Path("logical-entities")
  public LogicalEntitiesApi logicalEntities() {
    return resourceContext.initResource(
        new LogicalEntitiesApi(actorUserId, workspace.getIdentity(), workspaceModelService));
  }

  @Path("logical-relationships")
  public LogicalRelationshipsApi logicalRelationships() {
    return resourceContext.initResource(
        new LogicalRelationshipsApi(actorUserId, workspace.getIdentity(), workspaceModelService));
  }
}
