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
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.representation.WorkspaceMembershipCollectionModel;
import reengineering.ddd.evidence.api.representation.WorkspaceMembershipModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Membership;

public class WorkspaceMembershipsApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceService workspaceService;

  @Context private ResourceContext resourceContext;

  public WorkspaceMembershipsApi(
      String actorUserId, String workspaceId, WorkspaceService workspaceService) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaceService = workspaceService;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBERSHIPS)
  public WorkspaceMembershipCollectionModel findAll(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    WorkspaceService.MembershipPage memberships =
        workspaceService.workspaceMemberships(actorUserId, workspaceId, page, pageSize);
    return new WorkspaceMembershipCollectionModel(
        workspaceId, memberships, page, pageSize, uriInfo);
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBERSHIP)
  public Response add(AddMembershipRequest request, @Context UriInfo uriInfo) {
    if (request == null || request.user() == null || request.user().id() == null) {
      throw DomainException.validation("membership user is required");
    }
    Membership membership =
        workspaceService.addMembership(
            actorUserId, workspaceId, request.user().id(), request.role());
    return Response.status(Response.Status.CREATED)
        .entity(new WorkspaceMembershipModel(membership, uriInfo))
        .build();
  }

  @Path("{membershipId}")
  public WorkspaceMembershipApi findById(@PathParam("membershipId") String membershipId) {
    Membership membership =
        workspaceService.requireMembership(actorUserId, workspaceId, membershipId);
    return resourceContext.initResource(
        new WorkspaceMembershipApi(actorUserId, workspaceId, membership, workspaceService));
  }

  public record AddMembershipRequest(UserReference user, String role) {}

  public record UserReference(String id) {}
}
