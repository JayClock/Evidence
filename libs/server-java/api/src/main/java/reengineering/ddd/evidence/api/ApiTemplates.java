package reengineering.ddd.evidence.api;

import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;

public final class ApiTemplates {
  private ApiTemplates() {}

  public static URI root(UriInfo uriInfo) {
    return endpoint(uriInfo, "root");
  }

  public static URI health(UriInfo uriInfo) {
    return endpoint(uriInfo, "health");
  }

  public static URI currentUser(UriInfo uriInfo, String userId) {
    return rootBuilder(uriInfo).path("users").path(userId).build();
  }

  private static URI endpoint(UriInfo uriInfo, String methodName) {
    return uriInfo.getBaseUriBuilder().path(RootApi.class).path(RootApi.class, methodName).build();
  }

  private static UriBuilder rootBuilder(UriInfo uriInfo) {
    return uriInfo.getBaseUriBuilder().path(RootApi.class).path(RootApi.class, "root");
  }
}
