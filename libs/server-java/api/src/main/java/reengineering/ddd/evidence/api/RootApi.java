package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.databind.JsonNode;
import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;
import java.security.Principal;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.api.representation.HealthModel;
import reengineering.ddd.evidence.api.representation.RootModel;
import reengineering.ddd.evidence.application.WorkspaceService;

@Component
@Path("/")
public class RootApi {
  private final OpenApiDocument openApiDocument;
  private final WorkspaceService workspaceService;

  @Context private ResourceContext resourceContext;

  @Inject
  public RootApi(OpenApiDocument openApiDocument, WorkspaceService workspaceService) {
    this.openApiDocument = openApiDocument;
    this.workspaceService = workspaceService;
  }

  @GET
  @Path("api")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.ROOT)
  public RootModel root(@Context SecurityContext securityContext, @Context UriInfo uriInfo) {
    Principal principal = securityContext.getUserPrincipal();
    if (principal == null) {
      throw new IllegalStateException("Authenticated request lost its principal");
    }
    return RootModel.of(principal.getName(), uriInfo);
  }

  @GET
  @Path("health")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.HEALTH)
  public HealthModel health(@Context UriInfo uriInfo) {
    return HealthModel.of(uriInfo);
  }

  @Path("api/users")
  public UsersApi users() {
    return resourceContext.initResource(new UsersApi(workspaceService));
  }

  @Path("api/workspaces")
  public WorkspacesApi workspaces() {
    return resourceContext.initResource(new WorkspacesApi(workspaceService));
  }

  @GET
  @Path("api/openapi.json")
  @Produces(MediaType.APPLICATION_JSON)
  public JsonNode openApi() {
    return openApiDocument.get();
  }
}
