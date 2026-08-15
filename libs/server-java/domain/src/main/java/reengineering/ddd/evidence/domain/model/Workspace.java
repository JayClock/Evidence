package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import io.github.jayclock.smartdomain.core.HasOne;
import java.util.List;
import reengineering.ddd.evidence.domain.description.MemberDescription;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;

public class Workspace implements Entity<String, WorkspaceDescription> {
  private String identity;
  private WorkspaceDescription description;
  private Members members;
  private DiagramAssociation diagram;
  private LogicalEntities logicalEntities;
  private LogicalRelationships logicalRelationships;

  public Workspace(
      String identity,
      WorkspaceDescription description,
      Members members,
      DiagramAssociation diagram,
      LogicalEntities logicalEntities,
      LogicalRelationships logicalRelationships) {
    this.identity = identity;
    this.description = description;
    this.members = members;
    this.diagram = diagram;
    this.logicalEntities = logicalEntities;
    this.logicalRelationships = logicalRelationships;
  }

  private Workspace() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public WorkspaceDescription getDescription() {
    return description;
  }

  public HasMany<String, Member> members() {
    return members;
  }

  public Member addMember(MemberDescription description) {
    return members.add(description);
  }

  public Member updateMember(String memberId, String role) {
    return members.update(memberId, role);
  }

  public void removeMember(String memberId) {
    members.remove(memberId);
  }

  public HasOne<Diagram> diagram() {
    return diagram;
  }

  public HasMany<String, LogicalEntity> logicalEntities() {
    return logicalEntities;
  }

  public LogicalEntity addLogicalEntity(LogicalEntity.Description description) {
    return logicalEntities.add(description);
  }

  public LogicalEntity updateLogicalEntity(String entityId, LogicalEntity.Description description) {
    return logicalEntities.update(entityId, description);
  }

  public void deleteLogicalEntity(String entityId) {
    logicalEntities.remove(entityId);
  }

  public Page<LogicalEntity> listLogicalEntities(int page, int pageSize) {
    return logicalEntities.list(page, pageSize);
  }

  public HasMany<String, LogicalRelationship> logicalRelationships() {
    return logicalRelationships;
  }

  public LogicalRelationship addLogicalRelationship(LogicalRelationship.Description description) {
    return logicalRelationships.add(description);
  }

  public LogicalRelationship updateLogicalRelationship(
      String relationshipId, LogicalRelationship.Description description) {
    return logicalRelationships.update(relationshipId, description);
  }

  public void deleteLogicalRelationship(String relationshipId) {
    logicalRelationships.remove(relationshipId);
  }

  public Page<LogicalRelationship> listLogicalRelationships(int page, int pageSize) {
    return logicalRelationships.list(page, pageSize);
  }

  public interface Members extends HasMany<String, Member> {
    Member add(MemberDescription description);

    Member update(String memberId, String role);

    void remove(String memberId);
  }

  public interface DiagramAssociation extends HasOne<Diagram> {}

  public interface LogicalEntities extends HasMany<String, LogicalEntity> {
    LogicalEntity add(LogicalEntity.Description description);

    LogicalEntity update(String entityId, LogicalEntity.Description description);

    void remove(String entityId);

    Page<LogicalEntity> list(int page, int pageSize);
  }

  public interface LogicalRelationships extends HasMany<String, LogicalRelationship> {
    LogicalRelationship add(LogicalRelationship.Description description);

    LogicalRelationship update(String relationshipId, LogicalRelationship.Description description);

    void remove(String relationshipId);

    Page<LogicalRelationship> list(int page, int pageSize);
  }

  public record Page<E>(List<E> items, int total) {
    public Page {
      items = List.copyOf(items);
    }
  }
}
