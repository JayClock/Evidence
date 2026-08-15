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
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Workspace;

public class WorkspaceApi {
  private final String actorUserId;
  private final Workspace workspace;
  private final WorkspaceService workspaceService;

  @Context private ResourceContext resourceContext;

  public WorkspaceApi(String actorUserId, Workspace workspace, WorkspaceService workspaceService) {
    this.actorUserId = actorUserId;
    this.workspace = workspace;
    this.workspaceService = workspaceService;
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

  @Path("members")
  public WorkspaceMembersApi members() {
    return resourceContext.initResource(
        new WorkspaceMembersApi(actorUserId, workspace.getIdentity(), workspaceService));
  }
}
