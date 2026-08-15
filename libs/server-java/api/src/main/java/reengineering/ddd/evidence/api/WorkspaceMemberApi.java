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
import reengineering.ddd.evidence.api.representation.MemberModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Member;

public class WorkspaceMemberApi {
  private final String actorUserId;
  private final String workspaceId;
  private final Member member;
  private final WorkspaceService workspaceService;

  public WorkspaceMemberApi(
      String actorUserId, String workspaceId, Member member, WorkspaceService workspaceService) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.member = member;
    this.workspaceService = workspaceService;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBER)
  public MemberModel get(@Context UriInfo uriInfo) {
    return new MemberModel(member, uriInfo);
  }

  @PATCH
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBER)
  public MemberModel update(UpdateMemberRequest request, @Context UriInfo uriInfo) {
    if (request == null || request.role() == null) {
      throw DomainException.validation("member role is required");
    }
    Member updated =
        workspaceService.updateMember(
            actorUserId, workspaceId, member.getIdentity(), request.role());
    return new MemberModel(updated, uriInfo);
  }

  @DELETE
  public Response delete() {
    workspaceService.removeMember(actorUserId, workspaceId, member.getIdentity());
    return Response.noContent().build();
  }

  public record UpdateMemberRequest(String role) {}
}
