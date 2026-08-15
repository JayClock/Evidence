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
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.api.representation.PageModel;
import reengineering.ddd.evidence.application.WorkspaceModelService;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.LogicalEntity;
import reengineering.ddd.evidence.domain.model.Workspace;

public final class LogicalEntitiesApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceModelService workspaceModels;

  public LogicalEntitiesApi(
      String actorUserId, String workspaceId, WorkspaceModelService workspaceModels) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaceModels = workspaceModels;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_ENTITIES)
  public LogicalEntityCollectionModel list(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput, 50);
    return new LogicalEntityCollectionModel(
        workspaceId,
        workspaceModels.logicalEntities(actorUserId, workspaceId, page, pageSize),
        page,
        pageSize,
        uriInfo);
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_ENTITIES)
  public Response create(JsonNode input, @Context UriInfo uriInfo) {
    LogicalEntity entity =
        workspaceModels.createLogicalEntity(
            actorUserId, workspaceId, createDescription(workspaceId, input));
    return Response.status(Response.Status.CREATED)
        .entity(new LogicalEntityModel(entity, uriInfo))
        .build();
  }

  @GET
  @Path("{entityId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_ENTITY)
  public LogicalEntityModel get(@PathParam("entityId") String entityId, @Context UriInfo uriInfo) {
    return new LogicalEntityModel(
        workspaceModels.requireLogicalEntity(actorUserId, workspaceId, entityId), uriInfo);
  }

  @PUT
  @Path("{entityId}")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_ENTITY)
  public LogicalEntityModel update(
      @PathParam("entityId") String entityId, JsonNode input, @Context UriInfo uriInfo) {
    LogicalEntity current =
        workspaceModels.requireLogicalEntity(actorUserId, workspaceId, entityId);
    LogicalEntity updated =
        workspaceModels.updateLogicalEntity(
            actorUserId, workspaceId, entityId, updateDescription(current.getDescription(), input));
    return new LogicalEntityModel(updated, uriInfo);
  }

  @DELETE
  @Path("{entityId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.LOGICAL_ENTITY)
  public Map<String, Boolean> delete(@PathParam("entityId") String entityId) {
    workspaceModels.deleteLogicalEntity(actorUserId, workspaceId, entityId);
    return Map.of("deleted", true);
  }

  private static LogicalEntity.Description createDescription(String workspaceId, JsonNode input) {
    requireObject(input);
    LogicalEntity.Type type = LogicalEntity.parseType(requiredText(input, "type"));
    return new LogicalEntity.Description(
        new Ref<>(workspaceId),
        type,
        nullableText(input, "subType"),
        requiredText(input, "name"),
        nullableText(input, "label"),
        description(input, null),
        attributes(input, List.of()),
        Instant.EPOCH,
        Instant.EPOCH);
  }

  private static LogicalEntity.Description updateDescription(
      LogicalEntity.Description current, JsonNode input) {
    requireObject(input);
    LogicalEntity.Type type = current.type();
    if (input.hasNonNull("type")) {
      String requestedType = text(input.get("type"), "type");
      if (!requestedType.isEmpty()) type = LogicalEntity.parseType(requestedType);
    }
    String subType = input.has("subType") ? nullableText(input, "subType") : current.subType();
    String name = input.hasNonNull("name") ? text(input.get("name"), "name") : current.name();
    String label = input.has("label") ? nullableText(input, "label") : current.label();
    return new LogicalEntity.Description(
        current.workspace(),
        type,
        subType,
        name,
        label,
        description(input, current.description()),
        attributes(input, current.attributes()),
        current.createdAt(),
        current.updatedAt());
  }

  private static String description(JsonNode input, String fallback) {
    if (input.has("description")) return nullableText(input, "description");
    if (input.has("content")) return nullableText(input, "content");
    return fallback;
  }

  private static List<LogicalEntity.Attribute> attributes(
      JsonNode input, List<LogicalEntity.Attribute> fallback) {
    if (!input.has("attributes") || input.get("attributes").isNull()) return fallback;
    JsonNode values = input.get("attributes");
    if (!values.isArray()) {
      throw DomainException.validation("attributes must be an array");
    }
    List<LogicalEntity.Attribute> attributes = new ArrayList<>();
    for (JsonNode value : values) {
      requireObject(value);
      attributes.add(
          new LogicalEntity.Attribute(
              requiredText(value, "id"),
              requiredText(value, "name"),
              nullableText(value, "label"),
              nullableText(value, "type"),
              nullableText(value, "description")));
    }
    return List.copyOf(attributes);
  }

  private static String requiredText(JsonNode input, String name) {
    if (!input.hasNonNull(name)) {
      throw DomainException.validation(name + " is required");
    }
    return text(input.get(name), name);
  }

  private static String nullableText(JsonNode input, String name) {
    JsonNode value = input.get(name);
    return value == null || value.isNull() ? null : text(value, name);
  }

  private static String text(JsonNode value, String name) {
    if (!value.isTextual()) {
      throw DomainException.validation(name + " must be a string");
    }
    return value.asText();
  }

  private static void requireObject(JsonNode input) {
    if (input == null || !input.isObject()) {
      throw DomainException.validation("request body is required");
    }
  }

  public static final class LogicalEntityCollectionModel
      extends EvidenceModel<LogicalEntityCollectionModel> {
    @JsonProperty("_embedded")
    private final Embedded embedded;

    @JsonProperty private final PageModel page;

    private LogicalEntityCollectionModel(
        String workspaceId,
        Workspace.Page<LogicalEntity> entities,
        int pageNumber,
        int pageSize,
        UriInfo uriInfo) {
      embedded =
          new Embedded(
              entities.items().stream()
                  .map(entity -> new LogicalEntityModel(entity, uriInfo))
                  .toList());
      page = PageModel.of(pageNumber, pageSize, entities.total());
      addSelf(
          ApiTemplates.workspaceLogicalEntitiesPage(uriInfo, workspaceId, pageNumber, pageSize));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      if (pageNumber > 1) {
        addRelation(
            ApiTemplates.workspaceLogicalEntitiesPage(
                uriInfo, workspaceId, pageNumber - 1, pageSize),
            "prev");
      }
      if (pageNumber < page.totalPages()) {
        addRelation(
            ApiTemplates.workspaceLogicalEntitiesPage(
                uriInfo, workspaceId, pageNumber + 1, pageSize),
            "next");
      }
    }

    private record Embedded(
        @JsonProperty("logicalEntities") List<LogicalEntityModel> logicalEntities) {}
  }

  public static final class LogicalEntityModel extends EvidenceModel<LogicalEntityModel> {
    @JsonProperty private final String id;
    @JsonProperty private final LogicalEntity.Type type;
    @JsonProperty private final String subType;
    @JsonProperty private final String name;
    @JsonProperty private final String label;
    @JsonProperty private final String description;
    @JsonProperty private final List<LogicalEntity.Attribute> attributes;
    @JsonProperty private final Instant createdAt;
    @JsonProperty private final Instant updatedAt;

    public LogicalEntityModel(LogicalEntity entity, UriInfo uriInfo) {
      LogicalEntity.Description value = entity.getDescription();
      String workspaceId = value.workspace().id();
      id = entity.getIdentity();
      type = value.type();
      subType = LogicalEntity.formatSubType(value.type(), value.subType());
      name = value.name();
      label = value.label();
      description = value.description();
      attributes = value.attributes();
      createdAt = value.createdAt();
      updatedAt = value.updatedAt();
      addSelf(ApiTemplates.workspaceLogicalEntity(uriInfo, workspaceId, id));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(ApiTemplates.workspaceLogicalEntities(uriInfo, workspaceId), "collection");
    }
  }
}
