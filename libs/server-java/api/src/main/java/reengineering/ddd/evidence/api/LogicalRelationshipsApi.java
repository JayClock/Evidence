package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import io.github.jayclock.smartdomain.core.Ref;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.api.representation.PageModel;
import reengineering.ddd.evidence.application.WorkspaceModelService;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.LogicalRelationship;
import reengineering.ddd.evidence.domain.model.Workspace;

public final class LogicalRelationshipsApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceModelService workspaceModels;

  public LogicalRelationshipsApi(
      String actorUserId, String workspaceId, WorkspaceModelService workspaceModels) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaceModels = workspaceModels;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_RELATIONSHIPS)
  public LogicalRelationshipCollectionModel list(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput, 50);
    return new LogicalRelationshipCollectionModel(
        workspaceId,
        workspaceModels.logicalRelationships(actorUserId, workspaceId, page, pageSize),
        page,
        pageSize,
        uriInfo);
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_RELATIONSHIPS)
  public Response create(JsonNode input, @Context UriInfo uriInfo) {
    LogicalRelationship relationship =
        workspaceModels.createLogicalRelationship(
            actorUserId, workspaceId, createDescription(workspaceId, input));
    return Response.status(Response.Status.CREATED)
        .entity(new LogicalRelationshipModel(relationship, uriInfo))
        .build();
  }

  @GET
  @Path("{relationshipId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_RELATIONSHIP)
  public LogicalRelationshipModel get(
      @PathParam("relationshipId") String relationshipId, @Context UriInfo uriInfo) {
    return new LogicalRelationshipModel(
        workspaceModels.requireLogicalRelationship(actorUserId, workspaceId, relationshipId),
        uriInfo);
  }

  @PUT
  @Path("{relationshipId}")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_RELATIONSHIP)
  public LogicalRelationshipModel update(
      @PathParam("relationshipId") String relationshipId,
      JsonNode input,
      @Context UriInfo uriInfo) {
    LogicalRelationship current =
        workspaceModels.requireLogicalRelationship(actorUserId, workspaceId, relationshipId);
    LogicalRelationship updated =
        workspaceModels.updateLogicalRelationship(
            actorUserId,
            workspaceId,
            relationshipId,
            updateDescription(current.getDescription(), input));
    return new LogicalRelationshipModel(updated, uriInfo);
  }

  @DELETE
  @Path("{relationshipId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_RELATIONSHIP)
  public Map<String, Boolean> delete(@PathParam("relationshipId") String relationshipId) {
    workspaceModels.deleteLogicalRelationship(actorUserId, workspaceId, relationshipId);
    return Map.of("deleted", true);
  }

  private static LogicalRelationship.Description createDescription(
      String workspaceId, JsonNode input) {
    requireObject(input);
    return new LogicalRelationship.Description(
        new Ref<>(workspaceId),
        reference(input, "source", null),
        reference(input, "target", null),
        nullableText(input, "label"));
  }

  private static LogicalRelationship.Description updateDescription(
      LogicalRelationship.Description current, JsonNode input) {
    requireObject(input);
    return new LogicalRelationship.Description(
        current.workspace(),
        reference(input, "source", current.source()),
        reference(input, "target", current.target()),
        input.has("label") ? nullableText(input, "label") : current.label());
  }

  private static Ref<String> reference(JsonNode input, String name, Ref<String> fallback) {
    if (!input.has(name) || input.get(name).isNull()) {
      if (fallback != null) return fallback;
      throw DomainException.validation(name + " is required");
    }
    JsonNode value = input.get(name);
    if (!value.isObject() || !value.hasNonNull("id") || !value.get("id").isTextual()) {
      throw DomainException.validation(name + ".id must be a string");
    }
    return new Ref<>(value.get("id").asText());
  }

  private static String nullableText(JsonNode input, String name) {
    JsonNode value = input.get(name);
    if (value == null || value.isNull()) return null;
    if (!value.isTextual()) throw DomainException.validation(name + " must be a string");
    return value.asText();
  }

  private static void requireObject(JsonNode input) {
    if (input == null || !input.isObject()) {
      throw DomainException.validation("request body is required");
    }
  }

  public static final class LogicalRelationshipCollectionModel
      extends EvidenceModel<LogicalRelationshipCollectionModel> {
    @JsonProperty("_embedded")
    private final Embedded embedded;

    @JsonProperty private final PageModel page;

    private LogicalRelationshipCollectionModel(
        String workspaceId,
        Workspace.Page<LogicalRelationship> relationships,
        int pageNumber,
        int pageSize,
        UriInfo uriInfo) {
      embedded =
          new Embedded(
              relationships.items().stream()
                  .map(relationship -> new LogicalRelationshipModel(relationship, uriInfo))
                  .toList());
      page = PageModel.of(pageNumber, pageSize, relationships.total());
      addSelf(
          ApiTemplates.workspaceLogicalRelationshipsPage(
              uriInfo, workspaceId, pageNumber, pageSize));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      if (pageNumber > 1) {
        addRelation(
            ApiTemplates.workspaceLogicalRelationshipsPage(
                uriInfo, workspaceId, pageNumber - 1, pageSize),
            "prev");
      }
      if (pageNumber < page.totalPages()) {
        addRelation(
            ApiTemplates.workspaceLogicalRelationshipsPage(
                uriInfo, workspaceId, pageNumber + 1, pageSize),
            "next");
      }
    }

    private record Embedded(
        @JsonProperty("logicalRelationships")
            List<LogicalRelationshipModel> logicalRelationships) {}
  }

  public static final class LogicalRelationshipModel
      extends EvidenceModel<LogicalRelationshipModel> {
    @JsonProperty private final String id;
    @JsonProperty private final Ref<String> source;
    @JsonProperty private final Ref<String> target;
    @JsonProperty private final String label;

    private LogicalRelationshipModel(LogicalRelationship relationship, UriInfo uriInfo) {
      LogicalRelationship.Description value = relationship.getDescription();
      String workspaceId = value.workspace().id();
      id = relationship.getIdentity();
      source = value.source();
      target = value.target();
      label = value.label();
      addSelf(ApiTemplates.workspaceLogicalRelationship(uriInfo, workspaceId, id));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(ApiTemplates.workspaceLogicalRelationships(uriInfo, workspaceId), "collection");
    }
  }
}
