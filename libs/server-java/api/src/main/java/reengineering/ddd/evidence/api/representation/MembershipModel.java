package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import reengineering.ddd.evidence.api.ApiTemplates;
import reengineering.ddd.evidence.domain.description.MemberDescription;
import reengineering.ddd.evidence.domain.model.Member;
import reengineering.ddd.evidence.domain.model.Users;

public final class MembershipModel extends EvidenceModel<MembershipModel> {
  @JsonProperty private final String id;
  @JsonProperty private final WorkspaceModel workspace;
  @JsonProperty private final MemberModel.RefModel user;
  @JsonProperty private final String role;
  @JsonProperty private final Instant createdAt;
  @JsonProperty private final Instant updatedAt;

  public MembershipModel(Users.MembershipView membership, UriInfo uriInfo) {
    Member member = membership.member();
    MemberDescription description = member.getDescription();
    String workspaceId = description.workspace().id();
    String userId = description.user().id();
    id = member.getIdentity();
    workspace = new WorkspaceModel(membership.workspace(), uriInfo);
    user = MemberModel.RefModel.user(userId, uriInfo);
    role = description.role();
    createdAt = description.createdAt();
    updatedAt = description.updatedAt();
    addSelf(ApiTemplates.workspaceMember(uriInfo, workspaceId, id));
    addRelation(ApiTemplates.workspaceMembers(uriInfo, workspaceId), "collection");
    addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
    addRelation(ApiTemplates.user(uriInfo, userId), "user");
  }
}
