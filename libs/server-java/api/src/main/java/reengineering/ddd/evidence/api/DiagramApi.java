package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import io.github.jayclock.smartdomain.core.Ref;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.application.WorkspaceModelService;
import reengineering.ddd.evidence.domain.model.Diagram;
import reengineering.ddd.evidence.domain.model.LogicalEntity;

public final class DiagramApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceModelService workspaceModels;

  public DiagramApi(String actorUserId, String workspaceId, WorkspaceModelService workspaceModels) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaceModels = workspaceModels;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.DIAGRAM)
  public DiagramModel get(@Context UriInfo uriInfo) {
    return new DiagramModel(workspaceModels.diagram(actorUserId, workspaceId), uriInfo);
  }

  @GET
  @Path("nodes")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.NODES)
  public NodeCollectionModel nodes(@Context UriInfo uriInfo) {
    List<NodeModel> nodes =
        workspaceModels.nodes(actorUserId, workspaceId).stream()
            .map(node -> nodeModel(node, uriInfo))
            .toList();
    return new NodeCollectionModel(workspaceId, nodes, uriInfo);
  }

  @GET
  @Path("nodes/{nodeId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.NODE)
  public NodeModel node(@PathParam("nodeId") String nodeId, @Context UriInfo uriInfo) {
    return nodeModel(workspaceModels.requireNode(actorUserId, workspaceId, nodeId), uriInfo);
  }

  @GET
  @Path("edges")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.EDGES)
  public EdgeCollectionModel edges(@Context UriInfo uriInfo) {
    List<EdgeModel> edges =
        workspaceModels.edges(actorUserId, workspaceId).stream()
            .map(edge -> new EdgeModel(workspaceId, edge, uriInfo))
            .toList();
    return new EdgeCollectionModel(workspaceId, edges, uriInfo);
  }

  @GET
  @Path("edges/{edgeId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.EDGE)
  public EdgeModel edge(@PathParam("edgeId") String edgeId, @Context UriInfo uriInfo) {
    return new EdgeModel(
        workspaceId, workspaceModels.requireEdge(actorUserId, workspaceId, edgeId), uriInfo);
  }

  private NodeModel nodeModel(Diagram.Node node, UriInfo uriInfo) {
    Ref<String> reference = node.getDescription().logicalEntity();
    LogicalEntity logicalEntity =
        reference == null
            ? null
            : workspaceModels
                .findLogicalEntity(actorUserId, workspaceId, reference.id())
                .orElse(null);
    return new NodeModel(workspaceId, node, logicalEntity, uriInfo);
  }

  public static final class DiagramModel extends EvidenceModel<DiagramModel> {
    @JsonProperty("_templates")
    private final Map<String, Object> templates = Map.of();

    @JsonProperty private final String id;
    @JsonProperty private final String title;
    @JsonProperty private final Diagram.Viewport viewport;
    @JsonProperty private final Instant createdAt;
    @JsonProperty private final Instant updatedAt;

    private DiagramModel(Diagram diagram, UriInfo uriInfo) {
      Diagram.Description description = diagram.getDescription();
      String workspaceId = description.workspace().id();
      id = diagram.getIdentity();
      title = description.title();
      viewport = description.viewport();
      createdAt = description.createdAt();
      updatedAt = description.updatedAt();
      addSelf(ApiTemplates.workspaceDiagram(uriInfo, workspaceId));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(ApiTemplates.workspaceDiagramNodes(uriInfo, workspaceId), "nodes");
      addRelation(ApiTemplates.workspaceDiagramEdges(uriInfo, workspaceId), "edges");
      addRelation(ApiTemplates.workspaceLogicalEntities(uriInfo, workspaceId), "logical-entities");
      addRelation(
          ApiTemplates.workspaceLogicalRelationships(uriInfo, workspaceId),
          "logical-relationships");
    }
  }

  public static final class NodeCollectionModel extends EvidenceModel<NodeCollectionModel> {
    @JsonProperty("_embedded")
    private final NodeEmbedded embedded;

    private NodeCollectionModel(String workspaceId, List<NodeModel> nodes, UriInfo uriInfo) {
      embedded = new NodeEmbedded(nodes);
      addSelf(ApiTemplates.workspaceDiagramNodes(uriInfo, workspaceId));
      addRelation(ApiTemplates.workspaceDiagram(uriInfo, workspaceId), "diagram");
    }

    private record NodeEmbedded(@JsonProperty("nodes") List<NodeModel> nodes) {}
  }

  public static final class NodeModel extends EvidenceModel<NodeModel> {
    @JsonProperty("_embedded")
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private final Map<String, Object> embedded;

    @JsonProperty private final String id;
    @JsonProperty private final String kind;
    @JsonProperty private final Ref<String> parent;
    @JsonProperty private final Diagram.Position position;
    @JsonProperty private final Double width;
    @JsonProperty private final Double height;
    @JsonProperty private final Map<String, Object> data;
    @JsonProperty private final Instant createdAt;
    @JsonProperty private final Instant updatedAt;

    private NodeModel(
        String workspaceId, Diagram.Node node, LogicalEntity logicalEntity, UriInfo uriInfo) {
      Diagram.Node.Description description = node.getDescription();
      id = node.getIdentity();
      kind = description.kind();
      parent = description.parent();
      position = description.position();
      width = description.width();
      height = description.height();
      data = description.data();
      createdAt = description.createdAt();
      updatedAt = description.updatedAt();
      embedded =
          logicalEntity == null
              ? null
              : Map.of(
                  "logical-entity",
                  new LogicalEntitiesApi.LogicalEntityModel(logicalEntity, uriInfo));
      addSelf(ApiTemplates.workspaceDiagramNode(uriInfo, workspaceId, id));
      addRelation(ApiTemplates.workspaceDiagramNodes(uriInfo, workspaceId), "collection");
      addRelation(ApiTemplates.workspaceDiagram(uriInfo, workspaceId), "diagram");
      if (description.logicalEntity() != null) {
        addRelation(
            ApiTemplates.workspaceLogicalEntity(
                uriInfo, workspaceId, description.logicalEntity().id()),
            "logical-entity");
      }
    }
  }

  public static final class EdgeCollectionModel extends EvidenceModel<EdgeCollectionModel> {
    @JsonProperty("_embedded")
    private final EdgeEmbedded embedded;

    private EdgeCollectionModel(String workspaceId, List<EdgeModel> edges, UriInfo uriInfo) {
      embedded = new EdgeEmbedded(edges);
      addSelf(ApiTemplates.workspaceDiagramEdges(uriInfo, workspaceId));
      addRelation(ApiTemplates.workspaceDiagram(uriInfo, workspaceId), "diagram");
    }

    private record EdgeEmbedded(@JsonProperty("edges") List<EdgeModel> edges) {}
  }

  public static final class EdgeModel extends EvidenceModel<EdgeModel> {
    @JsonProperty private final String id;
    @JsonProperty private final Ref<String> source;
    @JsonProperty private final Ref<String> target;
    @JsonProperty private final Ref<String> logicalRelationship;
    @JsonProperty private final String sourceHandle;
    @JsonProperty private final String targetHandle;
    @JsonProperty private final String kind;
    @JsonProperty private final Map<String, Object> style;
    @JsonProperty private final Map<String, Object> data;
    @JsonProperty private final boolean animated;
    @JsonProperty private final boolean hidden;
    @JsonProperty private final Map<String, Object> markerStart;
    @JsonProperty private final Map<String, Object> markerEnd;
    @JsonProperty private final Map<String, Object> pathOptions;
    @JsonProperty private final Double interactionWidth;
    @JsonProperty private final Instant createdAt;
    @JsonProperty private final Instant updatedAt;

    private EdgeModel(String workspaceId, Diagram.Edge edge, UriInfo uriInfo) {
      Diagram.Edge.Description description = edge.getDescription();
      id = edge.getIdentity();
      source = description.source();
      target = description.target();
      logicalRelationship = description.logicalRelationship();
      sourceHandle = description.sourceHandle();
      targetHandle = description.targetHandle();
      kind = description.kind();
      style = description.style();
      data = description.data();
      animated = description.animated();
      hidden = description.hidden();
      markerStart = description.markerStart();
      markerEnd = description.markerEnd();
      pathOptions = description.pathOptions();
      interactionWidth = description.interactionWidth();
      createdAt = description.createdAt();
      updatedAt = description.updatedAt();
      addSelf(ApiTemplates.workspaceDiagramEdge(uriInfo, workspaceId, id));
      addRelation(ApiTemplates.workspaceDiagramEdges(uriInfo, workspaceId), "collection");
      addRelation(ApiTemplates.workspaceDiagram(uriInfo, workspaceId), "diagram");
    }
  }
}
