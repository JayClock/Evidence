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
import reengineering.ddd.evidence.api.representation.MemberCollectionModel;
import reengineering.ddd.evidence.api.representation.MemberModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Member;

public class WorkspaceMembersApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceService workspaceService;

  @Context private ResourceContext resourceContext;

  public WorkspaceMembersApi(
      String actorUserId, String workspaceId, WorkspaceService workspaceService) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaceService = workspaceService;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBERS)
  public MemberCollectionModel findAll(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    WorkspaceService.MemberPage members =
        workspaceService.members(actorUserId, workspaceId, page, pageSize);
    return new MemberCollectionModel(workspaceId, members, page, pageSize, uriInfo);
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBER)
  public Response add(AddMemberRequest request, @Context UriInfo uriInfo) {
    if (request == null || request.user() == null || request.user().id() == null) {
      throw DomainException.validation("member user is required");
    }
    Member member =
        workspaceService.addMember(actorUserId, workspaceId, request.user().id(), request.role());
    return Response.status(Response.Status.CREATED)
        .entity(new MemberModel(member, uriInfo))
        .build();
  }

  @Path("{memberId}")
  public WorkspaceMemberApi findById(@PathParam("memberId") String memberId) {
    Member member = workspaceService.requireMember(actorUserId, workspaceId, memberId);
    return resourceContext.initResource(
        new WorkspaceMemberApi(actorUserId, workspaceId, member, workspaceService));
  }

  public record AddMemberRequest(UserReference user, String role) {}

  public record UserReference(String id) {}
}
