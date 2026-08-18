package reengineering.ddd.evidence.api;

import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.representation.WorkspaceMembershipModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Membership;

public class WorkspaceMembershipApi {
  private final String actorUserId;
  private final String workspaceId;
  private final Membership membership;
  private final WorkspaceService workspaceService;

  public WorkspaceMembershipApi(
      String actorUserId,
      String workspaceId,
      Membership membership,
      WorkspaceService workspaceService) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.membership = membership;
    this.workspaceService = workspaceService;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBERSHIP)
  public WorkspaceMembershipModel get(@Context UriInfo uriInfo) {
    return new WorkspaceMembershipModel(membership, uriInfo);
  }

  @PATCH
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBERSHIP)
  public WorkspaceMembershipModel update(
      UpdateMembershipRequest request, @Context UriInfo uriInfo) {
    if (request == null || request.role() == null) {
      throw DomainException.validation("membership role is required");
    }
    Membership updated =
        workspaceService.updateMembership(
            actorUserId, workspaceId, membership.getIdentity(), request.role());
    return new WorkspaceMembershipModel(updated, uriInfo);
  }

  @DELETE
  public Response delete() {
    workspaceService.removeMembership(actorUserId, workspaceId, membership.getIdentity());
    return Response.noContent().build();
  }

  public record UpdateMembershipRequest(String role) {}
}
