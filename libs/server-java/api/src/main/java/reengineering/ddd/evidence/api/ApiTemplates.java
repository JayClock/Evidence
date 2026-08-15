package reengineering.ddd.evidence.api;

import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;

public final class ApiTemplates {
  private ApiTemplates() {}

  public static URI root(UriInfo uriInfo) {
    return endpoint(uriInfo, RootApi.class, "root");
  }

  public static URI health(UriInfo uriInfo) {
    return endpoint(uriInfo, RootApi.class, "health");
  }

  public static URI currentUser(UriInfo uriInfo, String userId) {
    return user(uriInfo, userId);
  }

  public static URI user(UriInfo uriInfo, String userId) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "users")
        .path(UsersApi.class, "findById")
        .build(userId);
  }

  public static URI userMemberships(UriInfo uriInfo, String userId) {
    return userBuilder(uriInfo).path(UserApi.class, "memberships").build(userId);
  }

  public static URI userMembershipsPage(UriInfo uriInfo, String userId, int page, int pageSize) {
    return UriBuilder.fromUri(userMemberships(uriInfo, userId))
        .queryParam("page", page)
        .queryParam("pageSize", pageSize)
        .build();
  }

  public static URI userSidebar(UriInfo uriInfo, String userId) {
    return userBuilder(uriInfo).path("sidebar").build(userId);
  }

  public static URI workspaces(UriInfo uriInfo) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "workspaces")
        .build();
  }

  public static URI workspace(UriInfo uriInfo, String workspaceId) {
    return workspaceBuilder(uriInfo).build(workspaceId);
  }

  public static URI workspaceMembers(UriInfo uriInfo, String workspaceId) {
    return workspaceBuilder(uriInfo).path(WorkspaceApi.class, "members").build(workspaceId);
  }

  public static URI workspaceMember(UriInfo uriInfo, String workspaceId, String memberId) {
    return workspaceBuilder(uriInfo)
        .path(WorkspaceApi.class, "members")
        .path(WorkspaceMembersApi.class, "findById")
        .build(workspaceId, memberId);
  }

  public static URI workspaceChild(UriInfo uriInfo, String workspaceId, String child) {
    return workspaceBuilder(uriInfo).path(child).build(workspaceId);
  }

  public static URI workspaceMembersPage(
      UriInfo uriInfo, String workspaceId, int page, int pageSize) {
    return UriBuilder.fromUri(workspaceMembers(uriInfo, workspaceId))
        .queryParam("page", page)
        .queryParam("pageSize", pageSize)
        .build();
  }

  private static URI endpoint(UriInfo uriInfo, Class<?> resourceType, String methodName) {
    return uriInfo.getBaseUriBuilder().path(resourceType).path(resourceType, methodName).build();
  }

  private static UriBuilder userBuilder(UriInfo uriInfo) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "users")
        .path(UsersApi.class, "findById");
  }

  private static UriBuilder workspaceBuilder(UriInfo uriInfo) {
    return uriInfo
        .getBaseUriBuilder()
        .path(RootApi.class)
        .path(RootApi.class, "workspaces")
        .path(WorkspacesApi.class, "findById");
  }
}
