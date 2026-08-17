package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.ScenarioDraftDescription;

public final class ScenarioDraft implements Entity<String, ScenarioDraftDescription> {
  private final String identity;
  private final ScenarioDraftDescription description;

  public ScenarioDraft(String identity, ScenarioDraftDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public ScenarioDraftDescription getDescription() {
    return description;
  }
}
