package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.NoModelImpactDescription;

public final class NoModelImpact implements Entity<String, NoModelImpactDescription> {
  private final String identity;
  private final NoModelImpactDescription description;

  public NoModelImpact(String identity, NoModelImpactDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public NoModelImpactDescription getDescription() {
    return description;
  }
}
