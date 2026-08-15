package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import reengineering.ddd.evidence.api.ApiTemplates;
import reengineering.ddd.evidence.domain.description.MemberDescription;
import reengineering.ddd.evidence.domain.model.Member;

public final class MemberModel extends EvidenceModel<MemberModel> {
  @JsonProperty private final String id;
  @JsonProperty private final RefModel workspace;
  @JsonProperty private final RefModel user;
  @JsonProperty private final String role;
  @JsonProperty private final Instant createdAt;
  @JsonProperty private final Instant updatedAt;

  public MemberModel(Member member, UriInfo uriInfo) {
    MemberDescription description = member.getDescription();
    String workspaceId = description.workspace().id();
    String userId = description.user().id();
    id = member.getIdentity();
    workspace = RefModel.workspace(workspaceId, uriInfo);
    user = RefModel.user(userId, uriInfo);
    role = description.role();
    createdAt = description.createdAt();
    updatedAt = description.updatedAt();
    addSelf(ApiTemplates.workspaceMember(uriInfo, workspaceId, id));
    addRelation(ApiTemplates.workspaceMembers(uriInfo, workspaceId), "collection");
    addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
    addRelation(ApiTemplates.user(uriInfo, userId), "user");
  }

  public static final class RefModel extends EvidenceModel<RefModel> {
    @JsonProperty private final String id;

    private RefModel(String id) {
      this.id = id;
    }

    private static RefModel workspace(String id, UriInfo uriInfo) {
      RefModel model = new RefModel(id);
      model.addSelf(ApiTemplates.workspace(uriInfo, id));
      return model;
    }

    public static RefModel user(String id, UriInfo uriInfo) {
      RefModel model = new RefModel(id);
      model.addSelf(ApiTemplates.user(uriInfo, id));
      return model;
    }
  }
}
