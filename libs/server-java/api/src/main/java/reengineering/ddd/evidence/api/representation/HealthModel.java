package reengineering.ddd.evidence.api.representation;

import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.ApiTemplates;

public class HealthModel extends EvidenceModel<HealthModel> {
  private final String status = "ok";
  private final String service = "evidence-server";

  private HealthModel() {}

  public static HealthModel of(UriInfo uriInfo) {
    HealthModel model = new HealthModel();
    model.addSelf(ApiTemplates.health(uriInfo));
    return model;
  }

  public String getStatus() {
    return status;
  }

  public String getService() {
    return service;
  }
}
