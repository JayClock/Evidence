package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.ApiTemplates;
import reengineering.ddd.evidence.domain.description.UserDescription;
import reengineering.ddd.evidence.domain.model.User;

public final class UserModel extends EvidenceModel<UserModel> {
  @JsonProperty private final String id;
  @JsonUnwrapped private final UserDescription description;

  public UserModel(User user, UriInfo uriInfo) {
    id = user.getIdentity();
    description = user.getDescription();
    addSelf(ApiTemplates.user(uriInfo, id));
    addRelation(ApiTemplates.userMemberships(uriInfo, id), "memberships");
    addRelation(ApiTemplates.workspaces(uriInfo), "create-workspace");
    addRelation(ApiTemplates.userSidebar(uriInfo, id), "sidebar");
  }
}
