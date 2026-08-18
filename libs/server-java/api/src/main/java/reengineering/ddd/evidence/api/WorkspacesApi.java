package reengineering.ddd.evidence.api;

import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;
import reengineering.ddd.evidence.api.representation.WorkspaceCollectionModel;
import reengineering.ddd.evidence.api.representation.WorkspaceModel;
import reengineering.ddd.evidence.application.WorkspaceModelService;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.domain.model.Workspaces;

public class WorkspacesApi {
  private final Workspaces workspaces;
  private final WorkspaceService workspaceService;
  private final WorkspaceModelService workspaceModelService;

  @Context private ResourceContext resourceContext;

  public WorkspacesApi(
      Workspaces workspaces,
      WorkspaceService workspaceService,
      WorkspaceModelService workspaceModelService) {
    this.workspaces = workspaces;
    this.workspaceService = workspaceService;
    this.workspaceModelService = workspaceModelService;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.WORKSPACES)
  public WorkspaceCollectionModel findAll(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context SecurityContext securityContext,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    String actorUserId = UsersApi.actor(securityContext);
    var accessible = workspaces.findAll(actorUserId);
    int total = accessible.size();
    int from = (int) Math.min((long) (page - 1) * pageSize, total);
    int to = Math.min(from + pageSize, total);
    return new WorkspaceCollectionModel(
        actorUserId,
        accessible.subCollection(from, to).stream().toList(),
        total,
        page,
        pageSize,
        uriInfo);
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.WORKSPACE)
  public Response create(
      WorkspaceRequest request,
      @Context SecurityContext securityContext,
      @Context UriInfo uriInfo) {
    if (request == null) {
      throw DomainException.validation("request body is required");
    }
    Workspace workspace =
        workspaces.create(UsersApi.actor(securityContext), request.toDescription());
    URI location = ApiTemplates.workspace(uriInfo, workspace.getIdentity());
    return Response.status(Response.Status.CREATED)
        .header("Location", location.getPath())
        .entity(new WorkspaceModel(workspace, uriInfo))
        .build();
  }

  @Path("{workspaceId}")
  public WorkspaceApi findById(
      @PathParam("workspaceId") String workspaceId, @Context SecurityContext securityContext) {
    String actorUserId = UsersApi.actor(securityContext);
    Workspace workspace =
        workspaces
            .findByIdentity(actorUserId, workspaceId)
            .orElseThrow(() -> DomainException.notFound("workspace " + workspaceId + " not found"));
    return resourceContext.initResource(
        new WorkspaceApi(actorUserId, workspace, workspaceService, workspaceModelService));
  }
}
