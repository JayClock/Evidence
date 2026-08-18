package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.ApiTemplates;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;
import reengineering.ddd.evidence.domain.model.Workspace;

public final class WorkspaceModel extends EvidenceModel<WorkspaceModel> {
  @JsonProperty private final String id;
  @JsonUnwrapped private final WorkspaceDescription description;

  public WorkspaceModel(Workspace workspace, UriInfo uriInfo) {
    id = workspace.getIdentity();
    description = workspace.getDescription();
    addSelf(ApiTemplates.workspace(uriInfo, id));
    addRelation(ApiTemplates.workspaceMemberships(uriInfo, id), "memberships");
    addRelation(ApiTemplates.workspaceChild(uriInfo, id, "diagram"), "diagram");
    addRelation(ApiTemplates.workspaceChild(uriInfo, id, "inbox-items"), "inbox-items");
    addRelation(ApiTemplates.workspaceChild(uriInfo, id, "inbox-extractions"), "inbox-extractions");
    addRelation(ApiTemplates.workspaceChild(uriInfo, id, "story-candidates"), "story-candidates");
    addRelation(ApiTemplates.workspaceChild(uriInfo, id, "iterations"), "iterations");
    addRelation(ApiTemplates.workspaceChild(uriInfo, id, "stories"), "stories");
    addRelation(ApiTemplates.workspaceChild(uriInfo, id, "logical-entities"), "logical-entities");
    addRelation(
        ApiTemplates.workspaceChild(uriInfo, id, "logical-relationships"), "logical-relationships");
  }
}
