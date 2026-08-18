package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import reengineering.ddd.evidence.api.ApiTemplates;
import reengineering.ddd.evidence.domain.description.MembershipDescription;
import reengineering.ddd.evidence.domain.model.Membership;
import reengineering.ddd.evidence.domain.model.Users;

public final class MembershipModel extends EvidenceModel<MembershipModel> {
  @JsonProperty private final String id;
  @JsonProperty private final WorkspaceModel workspace;
  @JsonProperty private final WorkspaceMembershipModel.RefModel user;
  @JsonProperty private final String role;
  @JsonProperty private final Instant createdAt;
  @JsonProperty private final Instant updatedAt;

  public MembershipModel(Users.MembershipView membershipView, UriInfo uriInfo) {
    Membership membership = membershipView.membership();
    MembershipDescription description = membership.getDescription();
    String workspaceId = description.workspace().id();
    String userId = description.user().id();
    id = membership.getIdentity();
    workspace = new WorkspaceModel(membershipView.workspace(), uriInfo);
    user = WorkspaceMembershipModel.RefModel.user(userId, uriInfo);
    role = description.role();
    createdAt = description.createdAt();
    updatedAt = description.updatedAt();
    addSelf(ApiTemplates.workspaceMembership(uriInfo, workspaceId, id));
    addRelation(ApiTemplates.workspaceMemberships(uriInfo, workspaceId), "collection");
    addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
    addRelation(ApiTemplates.user(uriInfo, userId), "user");
  }
}
