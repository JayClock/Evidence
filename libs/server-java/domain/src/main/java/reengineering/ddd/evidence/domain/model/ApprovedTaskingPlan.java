package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.ApprovedTaskingPlanDescription;

public final class ApprovedTaskingPlan implements Entity<String, ApprovedTaskingPlanDescription> {
  private final String identity;
  private final ApprovedTaskingPlanDescription description;

  public ApprovedTaskingPlan(String identity, ApprovedTaskingPlanDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public ApprovedTaskingPlanDescription getDescription() {
    return description;
  }
}
