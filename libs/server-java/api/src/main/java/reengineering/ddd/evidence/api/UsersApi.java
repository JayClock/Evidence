package reengineering.ddd.evidence.api;

import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.SecurityContext;
import java.security.Principal;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.User;

public class UsersApi {
  private final WorkspaceService workspaceService;

  @Context private ResourceContext resourceContext;

  public UsersApi(WorkspaceService workspaceService) {
    this.workspaceService = workspaceService;
  }

  @Path("{userId}")
  public UserApi findById(
      @PathParam("userId") String userId, @Context SecurityContext securityContext) {
    String actorUserId = actor(securityContext);
    User user = workspaceService.requireUser(actorUserId, userId);
    return resourceContext.initResource(new UserApi(actorUserId, user, workspaceService));
  }

  static String actor(SecurityContext securityContext) {
    Principal principal = securityContext.getUserPrincipal();
    if (principal == null) {
      throw new IllegalStateException("Authenticated request lost its principal");
    }
    return principal.getName();
  }
}
