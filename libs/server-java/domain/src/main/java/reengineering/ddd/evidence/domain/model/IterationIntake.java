package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.IterationIntakeDescription;

public final class IterationIntake implements Entity<String, IterationIntakeDescription> {
  private final String identity;
  private final IterationIntakeDescription description;

  public IterationIntake(String identity, IterationIntakeDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public IterationIntakeDescription getDescription() {
    return description;
  }
}
