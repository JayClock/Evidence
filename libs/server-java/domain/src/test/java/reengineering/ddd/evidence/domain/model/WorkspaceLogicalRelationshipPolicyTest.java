package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.Many;
import io.github.jayclock.smartdomain.core.Ref;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.LogicalEntityDescription;
import reengineering.ddd.evidence.domain.description.LogicalRelationshipDescription;

class WorkspaceLogicalRelationshipPolicyTest {
  @Test
  void rejectsRelationshipsForAnotherWorkspaceBeforePersistence() {
    FakeLogicalRelationships relationships = new FakeLogicalRelationships();
    Workspace workspace = workspace(List.of(entity("source"), entity("target")), relationships);
    LogicalRelationshipDescription description =
        relationship("another-workspace", "source", "target");

    DomainException error =
        assertThrows(DomainException.class, () -> workspace.addLogicalRelationship(description));

    assertEquals(DomainException.Kind.VALIDATION, error.kind());
    assertEquals(0, relationships.addCount);
  }

  @Test
  void rejectsMissingEndpointsBeforePersistence() {
    FakeLogicalRelationships relationships = new FakeLogicalRelationships();
    Workspace workspace = workspace(List.of(entity("target")), relationships);
    LogicalRelationshipDescription description = relationship("workspace-1", "source", "target");

    DomainException error =
        assertThrows(DomainException.class, () -> workspace.addLogicalRelationship(description));

    assertEquals(DomainException.Kind.VALIDATION, error.kind());
    assertEquals(0, relationships.addCount);
  }

  @Test
  void delegatesValidRelationshipsToTheAssociation() {
    FakeLogicalRelationships relationships = new FakeLogicalRelationships();
    Workspace workspace = workspace(List.of(entity("source"), entity("target")), relationships);
    LogicalRelationshipDescription description = relationship("workspace-1", "source", "target");

    LogicalRelationship created = workspace.addLogicalRelationship(description);

    assertSame(relationships.created, created);
    assertEquals(1, relationships.addCount);
  }

  private static Workspace workspace(
      List<LogicalEntity> entities, Workspace.LogicalRelationships relationships) {
    return new Workspace(
        "workspace-1",
        null,
        null,
        null,
        new FakeLogicalEntities(entities),
        relationships,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }

  private static LogicalEntity entity(String id) {
    return new LogicalEntity(id, null);
  }

  private static LogicalRelationshipDescription relationship(
      String workspaceId, String sourceId, String targetId) {
    return new LogicalRelationshipDescription(
        new Ref<>(workspaceId), new Ref<>(sourceId), new Ref<>(targetId), "relates");
  }

  private static final class FakeLogicalEntities implements Workspace.LogicalEntities {
    private final List<LogicalEntity> values;

    private FakeLogicalEntities(List<LogicalEntity> values) {
      this.values = values;
    }

    @Override
    public Many<LogicalEntity> findAll() {
      return new EntityMany<>(values);
    }

    @Override
    public Optional<LogicalEntity> findByIdentity(String entityId) {
      return values.stream().filter(entity -> entity.getIdentity().equals(entityId)).findFirst();
    }

    @Override
    public LogicalEntity add(LogicalEntityDescription description) {
      throw new UnsupportedOperationException();
    }

    @Override
    public LogicalEntity update(String entityId, LogicalEntityDescription description) {
      throw new UnsupportedOperationException();
    }

    @Override
    public void remove(String entityId) {
      throw new UnsupportedOperationException();
    }

    @Override
    public Workspace.Page<LogicalEntity> list(int page, int pageSize) {
      throw new UnsupportedOperationException();
    }
  }

  private static final class FakeLogicalRelationships implements Workspace.LogicalRelationships {
    private final LogicalRelationship created =
        new LogicalRelationship("relationship-1", null, () -> null, () -> null);
    private int addCount;

    @Override
    public Many<LogicalRelationship> findAll() {
      return new EntityMany<>(List.of());
    }

    @Override
    public Optional<LogicalRelationship> findByIdentity(String relationshipId) {
      return Optional.empty();
    }

    @Override
    public LogicalRelationship add(LogicalRelationshipDescription description) {
      addCount++;
      return created;
    }

    @Override
    public LogicalRelationship update(
        String relationshipId, LogicalRelationshipDescription description) {
      throw new UnsupportedOperationException();
    }

    @Override
    public void remove(String relationshipId) {
      throw new UnsupportedOperationException();
    }

    @Override
    public Workspace.Page<LogicalRelationship> list(int page, int pageSize) {
      throw new UnsupportedOperationException();
    }
  }

  private record EntityMany<E extends Entity<?, ?>>(List<E> values) implements Many<E> {
    @Override
    public int size() {
      return values.size();
    }

    @Override
    public Many<E> subCollection(int from, int to) {
      return new EntityMany<>(values.subList(from, to));
    }

    @Override
    public Iterator<E> iterator() {
      return values.iterator();
    }
  }
}
