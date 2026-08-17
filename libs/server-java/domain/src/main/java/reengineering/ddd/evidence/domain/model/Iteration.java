package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.IterationDescription;

public final class Iteration implements Entity<String, IterationDescription> {
  private final String identity;
  private final IterationDescription description;

  public Iteration(String identity, IterationDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public IterationDescription getDescription() {
    return description;
  }
}
