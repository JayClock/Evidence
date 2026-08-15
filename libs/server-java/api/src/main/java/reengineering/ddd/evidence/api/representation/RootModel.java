package reengineering.ddd.evidence.api.representation;

import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.ApiTemplates;

public class RootModel extends EvidenceModel<RootModel> {
  private RootModel() {}

  public static RootModel of(String userId, UriInfo uriInfo) {
    RootModel model = new RootModel();
    model.addSelf(ApiTemplates.root(uriInfo));
    model.addRelation(ApiTemplates.health(uriInfo), "health");
    model.addRelation(ApiTemplates.currentUser(uriInfo, userId), "current-user");
    return model;
  }
}
