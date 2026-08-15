package reengineering.ddd.evidence.persistent.filesystem;

import io.github.jayclock.smartdomain.core.Ref;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.LogicalEntity;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.persistent.mappers.WorkspacesMapper;

@AssociationMapping(
    entity = Workspace.class,
    field = "logicalEntities",
    parentIdField = "workspaceId")
public final class WorkspaceLogicalEntities extends EntityList<String, LogicalEntity>
    implements Workspace.LogicalEntities {
  private String workspaceId;
  @Inject private WorkspacesMapper workspaces;

  public WorkspaceLogicalEntities() {}

  WorkspaceLogicalEntities(String workspaceId, WorkspacesMapper workspaces) {
    this.workspaceId = workspaceId;
    this.workspaces = workspaces;
  }

  @Override
  protected List<LogicalEntity> findEntities(int from, int to) {
    List<EntityRecord> records = load();
    return records.subList(Math.min(from, records.size()), Math.min(to, records.size())).stream()
        .map(EntityRecord::entity)
        .toList();
  }

  @Override
  protected LogicalEntity findEntity(String id) {
    EntityRecord record = findRecord(id);
    return record == null ? null : record.entity();
  }

  @Override
  public int size() {
    return load().size();
  }

  @Override
  public LogicalEntity add(LogicalEntity.Description description) {
    validateWorkspace(description.workspace().id());
    String name = normalizeName(description.name());
    String id = availableId(name);
    Path path = entitiesDirectory().resolve(id + ".yaml");
    return write(path, id, copyWithName(description, name), null, true);
  }

  @Override
  public LogicalEntity update(String entityId, LogicalEntity.Description description) {
    validateWorkspace(description.workspace().id());
    EntityRecord current = findRecord(entityId);
    if (current == null) {
      throw DomainException.notFound("logical entity " + entityId + " not found");
    }
    return write(
        current.path(),
        entityId,
        copyWithName(description, normalizeName(description.name())),
        current.parent(),
        false);
  }

  @Override
  public void remove(String entityId) {
    EntityRecord current = findRecord(entityId);
    if (current == null) {
      throw DomainException.notFound("logical entity " + entityId + " not found");
    }
    ModelFiles.delete(current.path(), "logical entity");
  }

  @Override
  public Workspace.Page<LogicalEntity> list(int page, int pageSize) {
    validatePage(page, pageSize);
    List<EntityRecord> records = load();
    int from = Math.min((page - 1) * pageSize, records.size());
    int to = Math.min(from + pageSize, records.size());
    return new Workspace.Page<>(
        records.subList(from, to).stream().map(EntityRecord::entity).toList(), records.size());
  }

  private List<EntityRecord> load() {
    return ModelFiles.listYamlFiles(entitiesDirectory()).stream()
        .map(this::read)
        .sorted(
            Comparator.comparing((EntityRecord record) -> record.entity().getDescription().name())
                .thenComparing(record -> record.entity().getIdentity()))
        .toList();
  }

  private EntityRecord findRecord(String id) {
    return load().stream()
        .filter(record -> record.entity().getIdentity().equals(id))
        .findFirst()
        .orElse(null);
  }

  private EntityRecord read(Path path) {
    Map<String, Object> document = ModelFiles.readYaml(path, "logical entity");
    String id = ModelFiles.requiredString(document, "id", path, "logical entity");
    String name = ModelFiles.requiredString(document, "name", path, "logical entity");
    LogicalEntity.Type type =
        LogicalEntity.parseType(
            ModelFiles.requiredString(document, "type", path, "logical entity"));
    String subType =
        LogicalEntity.normalizeSubType(
            type,
            ModelFiles.optionalString(
                document.get("subType") != null
                    ? document.get("subType")
                    : document.get("sub_type")));
    String parent = ModelFiles.optionalString(document.get("parent"));
    Object descriptionValue =
        document.get("content") != null ? document.get("content") : document.get("description");
    String description =
        descriptionValue instanceof String text && !text.trim().isEmpty() ? text : null;
    var timestamp = ModelFiles.timestamp(path);
    return new EntityRecord(
        new LogicalEntity(
            id,
            new LogicalEntity.Description(
                new Ref<>(workspaceId),
                type,
                subType,
                name,
                ModelFiles.optionalString(document.get("label")),
                description,
                attributes(document.get("attributes")),
                timestamp,
                timestamp)),
        parent,
        path);
  }

  private LogicalEntity write(
      Path path, String id, LogicalEntity.Description description, String parent, boolean create) {
    String subType = LogicalEntity.normalizeSubType(description.type(), description.subType());
    Map<String, Object> document = new LinkedHashMap<>();
    document.put("id", id);
    document.put("name", description.name());
    if (description.label() != null) document.put("label", description.label());
    document.put("type", description.type().name());
    if (subType != null) document.put("subType", subType);
    if (parent != null) document.put("parent", parent);
    if (description.description() != null) {
      document.put("description", description.description());
    }
    if (!description.attributes().isEmpty()) {
      document.put("attributes", description.attributes());
    }
    if (create) {
      ModelFiles.writeNewYaml(path, document, "logical entity");
    } else {
      ModelFiles.replaceYaml(path, document, "logical entity");
    }
    return read(path).entity();
  }

  private String availableId(String name) {
    String normalized = normalizeIdentifier(name);
    String base = normalized == null ? UUID.randomUUID().toString() : normalized;
    String candidate = base;
    while (findRecord(candidate) != null
        || Files.exists(entitiesDirectory().resolve(candidate + ".yaml"))) {
      candidate = base + "_" + UUID.randomUUID().toString().substring(0, 8);
    }
    return candidate;
  }

  private Path entitiesDirectory() {
    String root = workspaces.findModelRoot(workspaceId);
    if (root == null) {
      throw DomainException.notFound("workspace " + workspaceId + " not found");
    }
    return Path.of(root).toAbsolutePath().normalize().resolve("entities");
  }

  private void validateWorkspace(String requestedWorkspaceId) {
    if (!workspaceId.equals(requestedWorkspaceId)) {
      throw DomainException.validation(
          "logical entity workspace "
              + requestedWorkspaceId
              + " does not match scoped workspace "
              + workspaceId);
    }
  }

  private static LogicalEntity.Description copyWithName(
      LogicalEntity.Description description, String name) {
    return new LogicalEntity.Description(
        description.workspace(),
        description.type(),
        description.subType(),
        name,
        description.label(),
        description.description(),
        description.attributes(),
        description.createdAt(),
        description.updatedAt());
  }

  private static String normalizeName(String name) {
    String normalized = name == null ? "" : name.trim();
    if (normalized.isEmpty()) {
      throw DomainException.validation("logical entity name must not be empty");
    }
    return normalized;
  }

  private static String normalizeIdentifier(String value) {
    String normalized =
        value
            .toLowerCase(java.util.Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "_")
            .replaceAll("^_+|_+$", "");
    return normalized.isEmpty() ? null : normalized;
  }

  private static List<LogicalEntity.Attribute> attributes(Object value) {
    if (!(value instanceof List<?> input)) return List.of();
    List<LogicalEntity.Attribute> attributes = new ArrayList<>();
    for (Object item : input) {
      if (!(item instanceof Map<?, ?> attribute)) continue;
      String id = ModelFiles.optionalString(attribute.get("id"));
      String name = ModelFiles.optionalString(attribute.get("name"));
      if (id == null || name == null) continue;
      attributes.add(
          new LogicalEntity.Attribute(
              id,
              name,
              ModelFiles.optionalString(attribute.get("label")),
              ModelFiles.optionalString(attribute.get("type")),
              ModelFiles.optionalString(attribute.get("description"))));
    }
    return List.copyOf(attributes);
  }

  private static void validatePage(int page, int pageSize) {
    if (page <= 0 || pageSize <= 0) {
      throw DomainException.validation("page and pageSize must be greater than 0");
    }
  }

  private record EntityRecord(LogicalEntity entity, String parent, Path path) {}
}
