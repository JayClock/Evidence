package reengineering.ddd.evidence.api;

import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.representation.SidebarModel;
import reengineering.ddd.evidence.api.representation.UserModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.User;

public class UserApi {
  private final String actorUserId;
  private final User user;
  private final WorkspaceService workspaceService;

  @Context private ResourceContext resourceContext;

  public UserApi(String actorUserId, User user, WorkspaceService workspaceService) {
    this.actorUserId = actorUserId;
    this.user = user;
    this.workspaceService = workspaceService;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.USER)
  public UserModel get(@Context UriInfo uriInfo) {
    return new UserModel(user, uriInfo);
  }

  @GET
  @Path("sidebar")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.SIDEBAR)
  public SidebarModel sidebar(@Context UriInfo uriInfo) {
    return new SidebarModel(user.getIdentity(), uriInfo);
  }

  @Path("memberships")
  public UserMembershipsApi memberships() {
    return resourceContext.initResource(
        new UserMembershipsApi(actorUserId, user.getIdentity(), workspaceService));
  }
}
