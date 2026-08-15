package reengineering.ddd.evidence.application;

import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Diagram;
import reengineering.ddd.evidence.domain.model.LogicalEntity;
import reengineering.ddd.evidence.domain.model.LogicalRelationship;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.domain.validation.WorkspaceAccess.Permission;

@Service
public class WorkspaceModelService {
  private final WorkspaceService workspaces;

  public WorkspaceModelService(WorkspaceService workspaces) {
    this.workspaces = workspaces;
  }

  public Diagram diagram(String actorUserId, String workspaceId) {
    return readableWorkspace(actorUserId, workspaceId).diagram().get();
  }

  public List<Diagram.Node> nodes(String actorUserId, String workspaceId) {
    return diagram(actorUserId, workspaceId).nodes().findAll().stream().toList();
  }

  public Diagram.Node requireNode(String actorUserId, String workspaceId, String nodeId) {
    return diagram(actorUserId, workspaceId)
        .nodes()
        .findByIdentity(nodeId)
        .orElseThrow(() -> DomainException.notFound("diagram node " + nodeId + " not found"));
  }

  public List<Diagram.Edge> edges(String actorUserId, String workspaceId) {
    return diagram(actorUserId, workspaceId).edges().findAll().stream().toList();
  }

  public Diagram.Edge requireEdge(String actorUserId, String workspaceId, String edgeId) {
    return diagram(actorUserId, workspaceId)
        .edges()
        .findByIdentity(edgeId)
        .orElseThrow(() -> DomainException.notFound("diagram edge " + edgeId + " not found"));
  }

  public Workspace.Page<LogicalEntity> logicalEntities(
      String actorUserId, String workspaceId, int page, int pageSize) {
    return readableWorkspace(actorUserId, workspaceId).listLogicalEntities(page, pageSize);
  }

  public Optional<LogicalEntity> findLogicalEntity(
      String actorUserId, String workspaceId, String entityId) {
    return readableWorkspace(actorUserId, workspaceId).logicalEntities().findByIdentity(entityId);
  }

  public LogicalEntity requireLogicalEntity(
      String actorUserId, String workspaceId, String entityId) {
    return findLogicalEntity(actorUserId, workspaceId, entityId)
        .orElseThrow(() -> DomainException.notFound("logical entity " + entityId + " not found"));
  }

  public LogicalEntity createLogicalEntity(
      String actorUserId, String workspaceId, LogicalEntity.Description description) {
    return managedWorkspace(actorUserId, workspaceId).addLogicalEntity(description);
  }

  public LogicalEntity updateLogicalEntity(
      String actorUserId,
      String workspaceId,
      String entityId,
      LogicalEntity.Description description) {
    return managedWorkspace(actorUserId, workspaceId).updateLogicalEntity(entityId, description);
  }

  public void deleteLogicalEntity(String actorUserId, String workspaceId, String entityId) {
    managedWorkspace(actorUserId, workspaceId).deleteLogicalEntity(entityId);
  }

  public Workspace.Page<LogicalRelationship> logicalRelationships(
      String actorUserId, String workspaceId, int page, int pageSize) {
    return readableWorkspace(actorUserId, workspaceId).listLogicalRelationships(page, pageSize);
  }

  public LogicalRelationship requireLogicalRelationship(
      String actorUserId, String workspaceId, String relationshipId) {
    return readableWorkspace(actorUserId, workspaceId)
        .logicalRelationships()
        .findByIdentity(relationshipId)
        .orElseThrow(
            () ->
                DomainException.notFound("logical relationship " + relationshipId + " not found"));
  }

  public LogicalRelationship createLogicalRelationship(
      String actorUserId, String workspaceId, LogicalRelationship.Description description) {
    return managedWorkspace(actorUserId, workspaceId).addLogicalRelationship(description);
  }

  public LogicalRelationship updateLogicalRelationship(
      String actorUserId,
      String workspaceId,
      String relationshipId,
      LogicalRelationship.Description description) {
    return managedWorkspace(actorUserId, workspaceId)
        .updateLogicalRelationship(relationshipId, description);
  }

  public void deleteLogicalRelationship(
      String actorUserId, String workspaceId, String relationshipId) {
    managedWorkspace(actorUserId, workspaceId).deleteLogicalRelationship(relationshipId);
  }

  private Workspace readableWorkspace(String actorUserId, String workspaceId) {
    return workspaces.requireWorkspace(actorUserId, workspaceId, Permission.READ);
  }

  private Workspace managedWorkspace(String actorUserId, String workspaceId) {
    return workspaces.requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
  }
}
