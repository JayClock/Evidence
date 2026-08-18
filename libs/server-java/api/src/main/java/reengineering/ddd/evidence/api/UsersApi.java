package reengineering.ddd.evidence.api;

import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.SecurityContext;
import java.security.Principal;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.User;
import reengineering.ddd.evidence.domain.model.Users;

public class UsersApi {
  private final Users users;

  @Context private ResourceContext resourceContext;

  public UsersApi(Users users) {
    this.users = users;
  }

  @Path("{userId}")
  public UserApi findById(
      @PathParam("userId") String userId, @Context SecurityContext securityContext) {
    String actorUserId = actor(securityContext);
    User user = requireUser(actorUserId, userId);
    return resourceContext.initResource(new UserApi(user));
  }

  private User requireUser(String actorUserId, String requestedUserId) {
    if (!actorUserId.equals(requestedUserId)) {
      throw DomainException.notFound("user " + requestedUserId + " not found");
    }
    return users
        .findByIdentity(requestedUserId)
        .orElseThrow(() -> DomainException.notFound("user " + requestedUserId + " not found"));
  }

  static String actor(SecurityContext securityContext) {
    Principal principal = securityContext.getUserPrincipal();
    if (principal == null) {
      throw new IllegalStateException("Authenticated request lost its principal");
    }
    return principal.getName();
  }
}
