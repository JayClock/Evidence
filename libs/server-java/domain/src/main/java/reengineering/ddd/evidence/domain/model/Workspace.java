package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import io.github.jayclock.smartdomain.core.HasOne;
import java.util.List;
import reengineering.ddd.evidence.domain.description.LogicalEntityDescription;
import reengineering.ddd.evidence.domain.description.LogicalRelationshipDescription;
import reengineering.ddd.evidence.domain.description.MembershipDescription;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;

public class Workspace implements Entity<String, WorkspaceDescription> {
  private String identity;
  private WorkspaceDescription description;
  private Memberships memberships;
  private DiagramAssociation diagram;
  private LogicalEntities logicalEntities;
  private LogicalRelationships logicalRelationships;
  private InboxItems inboxItems;
  private InboxWorkflowAssociation inboxWorkflow;
  private WorkflowAssociation workflow;
  private ExecutionAssociation execution;

  public Workspace(
      String identity,
      WorkspaceDescription description,
      Memberships memberships,
      DiagramAssociation diagram,
      LogicalEntities logicalEntities,
      LogicalRelationships logicalRelationships,
      InboxItems inboxItems,
      InboxWorkflowAssociation inboxWorkflow,
      WorkflowAssociation workflow,
      ExecutionAssociation execution) {
    this.identity = identity;
    this.description = description;
    this.memberships = memberships;
    this.diagram = diagram;
    this.logicalEntities = logicalEntities;
    this.logicalRelationships = logicalRelationships;
    this.inboxItems = inboxItems;
    this.inboxWorkflow = inboxWorkflow;
    this.workflow = workflow;
    this.execution = execution;
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

  public HasMany<String, Membership> memberships() {
    return memberships;
  }

  public Membership addMembership(MembershipDescription description) {
    return memberships.add(description);
  }

  public Membership updateMembership(String membershipId, String role) {
    return memberships.update(membershipId, role);
  }

  public void removeMembership(String membershipId) {
    memberships.remove(membershipId);
  }

  public HasOne<Diagram> diagram() {
    return diagram;
  }

  public HasMany<String, LogicalEntity> logicalEntities() {
    return logicalEntities;
  }

  public LogicalEntity addLogicalEntity(LogicalEntityDescription description) {
    return logicalEntities.add(description);
  }

  public LogicalEntity updateLogicalEntity(String entityId, LogicalEntityDescription description) {
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

  public LogicalRelationship addLogicalRelationship(LogicalRelationshipDescription description) {
    return logicalRelationships.add(description);
  }

  public LogicalRelationship updateLogicalRelationship(
      String relationshipId, LogicalRelationshipDescription description) {
    return logicalRelationships.update(relationshipId, description);
  }

  public void deleteLogicalRelationship(String relationshipId) {
    logicalRelationships.remove(relationshipId);
  }

  public Page<LogicalRelationship> listLogicalRelationships(int page, int pageSize) {
    return logicalRelationships.list(page, pageSize);
  }

  public HasMany<String, InboxItem> inboxItems() {
    return inboxItems;
  }

  public Inbox.Page<InboxItem> listInboxItems(Inbox.ListQuery query) {
    return inboxItems.list(query);
  }

  public Inbox.Captured captureInboxItem(Inbox.SourceInput source) {
    return inboxItems.capture(source);
  }

  public Inbox.Captured appendInboxRevision(
      String itemId, Inbox.SourceInput source, String expectedLatestRevisionSha256) {
    return inboxItems.appendRevision(itemId, source, expectedLatestRevisionSha256);
  }

  public InboxItem changeInboxItemStatus(
      String itemId, Inbox.ItemStatus status, int expectedVersion) {
    return inboxItems.changeStatus(itemId, status, expectedVersion);
  }

  public InboxWorkflow.Association inboxWorkflow() {
    return inboxWorkflow;
  }

  public IterationWorkflow.Association iterations() {
    return workflow;
  }

  public Understanding.Association understanding() {
    return workflow;
  }

  public Tasking.Association tasking() {
    return workflow;
  }

  public Delivery.Association delivery() {
    return workflow;
  }

  public Pair.Association pair() {
    return execution;
  }

  public Showcase.Association showcase() {
    return execution;
  }

  public Respond.Association respond() {
    return execution;
  }

  public interface Memberships extends HasMany<String, Membership> {
    Membership add(MembershipDescription description);

    Membership update(String membershipId, String role);

    void remove(String membershipId);
  }

  public interface DiagramAssociation extends HasOne<Diagram> {}

  public interface LogicalEntities extends HasMany<String, LogicalEntity> {
    LogicalEntity add(LogicalEntityDescription description);

    LogicalEntity update(String entityId, LogicalEntityDescription description);

    void remove(String entityId);

    Page<LogicalEntity> list(int page, int pageSize);
  }

  public interface LogicalRelationships extends HasMany<String, LogicalRelationship> {
    LogicalRelationship add(LogicalRelationshipDescription description);

    LogicalRelationship update(String relationshipId, LogicalRelationshipDescription description);

    void remove(String relationshipId);

    Page<LogicalRelationship> list(int page, int pageSize);
  }

  public interface InboxItems extends Inbox.Items {}

  public interface InboxWorkflowAssociation extends InboxWorkflow.Association {}

  public interface WorkflowAssociation
      extends IterationWorkflow.Association,
          Understanding.Association,
          Tasking.Association,
          Delivery.Association {}

  public interface ExecutionAssociation
      extends Pair.Association, Showcase.Association, Respond.Association {}

  public record Page<E>(List<E> items, int total) {
    public Page {
      items = List.copyOf(items);
    }
  }
}
