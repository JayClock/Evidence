package reengineering.ddd.evidence.persistent.filesystem;

import io.github.jayclock.smartdomain.core.Ref;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.DiagramDescription;
import reengineering.ddd.evidence.domain.description.DiagramEdgeDescription;
import reengineering.ddd.evidence.domain.description.DiagramNodeDescription;
import reengineering.ddd.evidence.domain.model.Diagram;
import reengineering.ddd.evidence.domain.model.DiagramEdge;
import reengineering.ddd.evidence.domain.model.DiagramNode;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.persistent.mappers.WorkspacesMapper;

@AssociationMapping(entity = Workspace.class, field = "diagram", parentIdField = "workspaceId")
public final class WorkspaceDiagram implements Workspace.DiagramAssociation {
  private static final String DIAGRAM_ID = "model";
  private static final String DIAGRAM_TITLE = "Model";

  private String workspaceId;
  @Inject private WorkspacesMapper workspaces;

  public WorkspaceDiagram() {}

  @Override
  public Diagram get() {
    Path root = modelRoot();
    var timestamp = ModelFiles.timestamp(root);
    return new Diagram(
        DIAGRAM_ID,
        new DiagramDescription(
            new Ref<>(workspaceId),
            DIAGRAM_TITLE,
            DiagramDescription.Viewport.defaultViewport(),
            timestamp,
            timestamp),
        new Nodes(DIAGRAM_ID, root),
        new Edges(DIAGRAM_ID, root));
  }

  private Path modelRoot() {
    String root = workspaces.findModelRoot(workspaceId);
    if (root == null) {
      throw DomainException.notFound("workspace " + workspaceId + " not found");
    }
    return Path.of(root).toAbsolutePath().normalize();
  }

  private static final class Nodes extends EntityList<String, DiagramNode> {
    private final String diagramId;
    private final Path directory;

    private Nodes(String diagramId, Path evidenceRoot) {
      this.diagramId = diagramId;
      directory = evidenceRoot.resolve("entities");
    }

    @Override
    protected List<DiagramNode> findEntities(int from, int to) {
      List<NodeRecord> records = load();
      return records.subList(Math.min(from, records.size()), Math.min(to, records.size())).stream()
          .map(NodeRecord::node)
          .toList();
    }

    @Override
    protected DiagramNode findEntity(String id) {
      return load().stream()
          .filter(record -> record.node().getIdentity().equals(id))
          .map(NodeRecord::node)
          .findFirst()
          .orElse(null);
    }

    @Override
    public int size() {
      return load().size();
    }

    private List<NodeRecord> load() {
      List<NodeRecord> records =
          ModelFiles.listYamlFiles(directory).stream()
              .map(this::readNode)
              .sorted(
                  Comparator.comparing(NodeRecord::sortName)
                      .thenComparing(record -> record.node().getIdentity()))
              .toList();
      List<NodeRecord> positioned = new ArrayList<>(records.size());
      for (int index = 0; index < records.size(); index++) {
        NodeRecord record = records.get(index);
        DiagramNodeDescription description = record.node().getDescription();
        positioned.add(
            new NodeRecord(
                record.sortName(),
                new DiagramNode(
                    record.node().getIdentity(),
                    new DiagramNodeDescription(
                        description.diagram(),
                        description.kind(),
                        description.logicalEntity(),
                        description.parent(),
                        gridPosition(index),
                        description.width(),
                        description.height(),
                        description.data(),
                        description.createdAt(),
                        description.updatedAt()))));
      }
      return positioned;
    }

    private NodeRecord readNode(Path path) {
      Map<String, Object> document = ModelFiles.readYaml(path, "entity");
      String id = ModelFiles.requiredString(document, "id", path, "entity");
      String name = ModelFiles.requiredString(document, "name", path, "entity");
      String entityType = ModelFiles.requiredString(document, "type", path, "entity");
      String label = ModelFiles.optionalString(document.get("label"));
      String subType =
          ModelFiles.optionalString(
              document.get("subType") != null ? document.get("subType") : document.get("sub_type"));
      String parent = ModelFiles.optionalString(document.get("parent"));
      Object contentValue =
          document.get("content") != null ? document.get("content") : document.get("description");
      String content = contentValue instanceof String text && !text.trim().isEmpty() ? text : null;
      Map<String, Object> data = new LinkedHashMap<>();
      data.put("id", id);
      data.put("name", name);
      data.put("type", entityType);
      if (label != null) data.put("label", label);
      if (subType != null) data.put("subType", subType);
      if (parent != null) data.put("parent", parent);
      if (content != null) data.put("content", content);
      if (document.get("attributes") instanceof List<?> attributes && !attributes.isEmpty()) {
        data.put("attributes", attributes);
      }
      var timestamp = ModelFiles.timestamp(path);
      return new NodeRecord(
          label == null ? name : label,
          new DiagramNode(
              id,
              new DiagramNodeDescription(
                  new Ref<>(diagramId),
                  entityType.equalsIgnoreCase("CONTEXT") ? "group-container" : "fulfillment-node",
                  new Ref<>(id),
                  parent == null ? null : new Ref<>(parent),
                  new Diagram.Position(0, 0),
                  null,
                  null,
                  data,
                  timestamp,
                  timestamp)));
    }

    private Diagram.Position gridPosition(int index) {
      int columns = 4;
      return new Diagram.Position(120 + (index % columns) * 240, 120 + (index / columns) * 140);
    }
  }

  private static final class Edges extends EntityList<String, DiagramEdge> {
    private final String diagramId;
    private final Path directory;

    private Edges(String diagramId, Path evidenceRoot) {
      this.diagramId = diagramId;
      directory = evidenceRoot.resolve("associations");
    }

    @Override
    protected List<DiagramEdge> findEntities(int from, int to) {
      List<EdgeRecord> records = load();
      return records.subList(Math.min(from, records.size()), Math.min(to, records.size())).stream()
          .map(EdgeRecord::edge)
          .toList();
    }

    @Override
    protected DiagramEdge findEntity(String id) {
      return load().stream()
          .filter(record -> record.edge().getIdentity().equals(id))
          .map(EdgeRecord::edge)
          .findFirst()
          .orElse(null);
    }

    @Override
    public int size() {
      return load().size();
    }

    private List<EdgeRecord> load() {
      return ModelFiles.listYamlFiles(directory).stream()
          .map(this::readEdge)
          .sorted(
              Comparator.comparing(EdgeRecord::sortName)
                  .thenComparing(record -> record.edge().getIdentity()))
          .toList();
    }

    private EdgeRecord readEdge(Path path) {
      Map<String, Object> document = ModelFiles.readYaml(path, "association");
      String id = ModelFiles.requiredString(document, "id", path, "association");
      String name = ModelFiles.requiredString(document, "name", path, "association");
      String source = ModelFiles.requiredString(document, "source", path, "association");
      String target = ModelFiles.requiredString(document, "target", path, "association");
      String label = ModelFiles.optionalString(document.get("label"));
      Map<String, Object> data = new LinkedHashMap<>();
      data.put("id", id);
      data.put("name", name);
      data.put("source", source);
      data.put("target", target);
      copyOptional(document, data, "kind", "kind");
      if (label != null) data.put("label", label);
      copyOptional(document, data, "relationshipType", "relationType");
      if (!document.containsKey("relationshipType")) {
        copyOptional(document, data, "relationship_type", "relationType");
      }
      copyOptional(document, data, "direction", "direction");
      copyOptional(document, data, "cardinality", "cardinality");
      copyOptional(document, data, "summary", "summary");
      var timestamp = ModelFiles.timestamp(path);
      return new EdgeRecord(
          label == null ? name : label,
          new DiagramEdge(
              id,
              new DiagramEdgeDescription(
                  new Ref<>(diagramId),
                  new Ref<>(source),
                  new Ref<>(target),
                  new Ref<>(id),
                  null,
                  null,
                  "animated",
                  Map.of(),
                  data,
                  true,
                  false,
                  null,
                  null,
                  Map.of(),
                  null,
                  timestamp,
                  timestamp)));
    }

    private void copyOptional(
        Map<String, Object> source,
        Map<String, Object> target,
        String sourceKey,
        String targetKey) {
      String value = ModelFiles.optionalString(source.get(sourceKey));
      if (value != null) target.put(targetKey, value);
    }
  }

  private record NodeRecord(String sortName, DiagramNode node) {}

  private record EdgeRecord(String sortName, DiagramEdge edge) {}
}
