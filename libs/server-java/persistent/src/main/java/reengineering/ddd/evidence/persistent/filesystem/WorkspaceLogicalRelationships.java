package reengineering.ddd.evidence.persistent.filesystem;

import io.github.jayclock.smartdomain.core.Ref;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.LogicalRelationshipDescription;
import reengineering.ddd.evidence.domain.model.LogicalRelationship;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.persistent.mappers.WorkspacesMapper;

@AssociationMapping(
    entity = Workspace.class,
    field = "logicalRelationships",
    parentIdField = "workspaceId")
public final class WorkspaceLogicalRelationships extends EntityList<String, LogicalRelationship>
    implements Workspace.LogicalRelationships {
  private String workspaceId;
  @Inject private WorkspacesMapper workspaces;

  public WorkspaceLogicalRelationships() {}

  @Override
  protected List<LogicalRelationship> findEntities(int from, int to) {
    List<RelationshipRecord> records = load();
    return records.subList(Math.min(from, records.size()), Math.min(to, records.size())).stream()
        .map(RelationshipRecord::relationship)
        .toList();
  }

  @Override
  protected LogicalRelationship findEntity(String id) {
    RelationshipRecord record = findRecord(id);
    return record == null ? null : record.relationship();
  }

  @Override
  public int size() {
    return load().size();
  }

  @Override
  public LogicalRelationship add(LogicalRelationshipDescription description) {
    validateDescription(description);
    String id = availableId(description);
    return write(
        associationsDirectory().resolve(id + ".yaml"), relationshipDocument(id, description), true);
  }

  @Override
  public LogicalRelationship update(
      String relationshipId, LogicalRelationshipDescription description) {
    RelationshipRecord current = findRecord(relationshipId);
    if (current == null) {
      throw DomainException.notFound("logical relationship " + relationshipId + " not found");
    }
    validateDescription(description);
    Map<String, Object> document = new LinkedHashMap<>(current.document());
    document.put("id", relationshipId);
    document.putIfAbsent("name", relationshipName(relationshipId));
    if (description.label() == null) {
      document.remove("label");
    } else {
      document.put("label", description.label());
    }
    document.put("source", description.source().id());
    document.put("target", description.target().id());
    return write(current.path(), document, false);
  }

  @Override
  public void remove(String relationshipId) {
    RelationshipRecord current = findRecord(relationshipId);
    if (current == null) {
      throw DomainException.notFound("logical relationship " + relationshipId + " not found");
    }
    ModelFiles.delete(current.path(), "logical relationship");
  }

  @Override
  public Workspace.Page<LogicalRelationship> list(int page, int pageSize) {
    validatePage(page, pageSize);
    List<RelationshipRecord> records = load();
    int from = Math.min((page - 1) * pageSize, records.size());
    int to = Math.min(from + pageSize, records.size());
    return new Workspace.Page<>(
        records.subList(from, to).stream().map(RelationshipRecord::relationship).toList(),
        records.size());
  }

  private List<RelationshipRecord> load() {
    return ModelFiles.listYamlFiles(associationsDirectory()).stream()
        .map(this::read)
        .sorted(java.util.Comparator.comparing(record -> record.relationship().getIdentity()))
        .toList();
  }

  private RelationshipRecord findRecord(String id) {
    return load().stream()
        .filter(record -> record.relationship().getIdentity().equals(id))
        .findFirst()
        .orElse(null);
  }

  private RelationshipRecord read(Path path) {
    Map<String, Object> document = ModelFiles.readYaml(path, "logical relationship");
    String id = ModelFiles.requiredString(document, "id", path, "logical relationship");
    ModelFiles.requiredString(document, "name", path, "logical relationship");
    String source = ModelFiles.requiredString(document, "source", path, "logical relationship");
    String target = ModelFiles.requiredString(document, "target", path, "logical relationship");
    return new RelationshipRecord(
        document,
        path,
        new LogicalRelationship(
            id,
            new LogicalRelationshipDescription(
                new Ref<>(workspaceId),
                new Ref<>(source),
                new Ref<>(target),
                ModelFiles.optionalString(document.get("label")))));
  }

  private LogicalRelationship write(Path path, Map<String, Object> document, boolean create) {
    if (create) {
      ModelFiles.writeNewYaml(path, document, "logical relationship");
    } else {
      ModelFiles.replaceYaml(path, document, "logical relationship");
    }
    return read(path).relationship();
  }

  private void validateDescription(LogicalRelationshipDescription description) {
    if (!workspaceId.equals(description.workspace().id())) {
      throw DomainException.validation(
          "logical relationship workspace "
              + description.workspace().id()
              + " does not match scoped workspace "
              + workspaceId);
    }
    WorkspaceLogicalEntities entities = new WorkspaceLogicalEntities(workspaceId, workspaces);
    validateEndpoint("source", description.source().id(), entities);
    validateEndpoint("target", description.target().id(), entities);
  }

  private void validateEndpoint(
      String label, String endpointId, WorkspaceLogicalEntities entities) {
    if (entities.findByIdentity(endpointId).isEmpty()) {
      throw DomainException.validation(
          "logical relationship "
              + label
              + " endpoint "
              + endpointId
              + " not found in workspace "
              + workspaceId);
    }
  }

  private String availableId(LogicalRelationshipDescription description) {
    String requested =
        description.label() == null
            ? description.source().id() + "_" + description.target().id()
            : description.label();
    String normalized = normalizeIdentifier(requested);
    String base = normalized == null ? UUID.randomUUID().toString() : normalized;
    String candidate = base;
    while (findRecord(candidate) != null
        || Files.exists(associationsDirectory().resolve(candidate + ".yaml"))) {
      candidate = base + "_" + UUID.randomUUID().toString().substring(0, 8);
    }
    return candidate;
  }

  private Map<String, Object> relationshipDocument(
      String id, LogicalRelationshipDescription description) {
    Map<String, Object> document = new LinkedHashMap<>();
    document.put("id", id);
    document.put("kind", "association");
    document.put("name", relationshipName(id));
    if (description.label() != null) document.put("label", description.label());
    document.put("source", description.source().id());
    document.put("target", description.target().id());
    document.put("relationshipType", "relates_to");
    document.put("direction", "directed");
    return document;
  }

  private Path associationsDirectory() {
    String root = workspaces.findModelRoot(workspaceId);
    if (root == null) {
      throw DomainException.notFound("workspace " + workspaceId + " not found");
    }
    return Path.of(root).toAbsolutePath().normalize().resolve("associations");
  }

  private static String relationshipName(String id) {
    StringBuilder name = new StringBuilder();
    for (String part : id.split("[^a-zA-Z0-9]+")) {
      if (part.isEmpty()) continue;
      name.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
    }
    return name.toString();
  }

  private static String normalizeIdentifier(String value) {
    String normalized =
        value
            .toLowerCase(java.util.Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "_")
            .replaceAll("^_+|_+$", "");
    return normalized.isEmpty() ? null : normalized;
  }

  private static void validatePage(int page, int pageSize) {
    if (page <= 0 || pageSize <= 0) {
      throw DomainException.validation("page and pageSize must be greater than 0");
    }
  }

  private record RelationshipRecord(
      Map<String, Object> document, Path path, LogicalRelationship relationship) {}
}
