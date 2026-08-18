package reengineering.ddd.evidence.api;

import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.representation.MembershipCollectionModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.Users;

public class UserMembershipsApi {
  private final String actorUserId;
  private final String userId;
  private final WorkspaceService workspaceService;

  public UserMembershipsApi(String actorUserId, String userId, WorkspaceService workspaceService) {
    this.actorUserId = actorUserId;
    this.userId = userId;
    this.workspaceService = workspaceService;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBERSHIPS)
  public MembershipCollectionModel findAll(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    Users.MembershipPage memberships =
        workspaceService.userMemberships(actorUserId, userId, page, pageSize);
    return new MembershipCollectionModel(userId, memberships, page, pageSize, uriInfo);
  }
}
