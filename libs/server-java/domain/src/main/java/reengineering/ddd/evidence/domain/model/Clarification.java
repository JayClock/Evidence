package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.ClarificationDescription;

public final class Clarification implements Entity<String, ClarificationDescription> {
  private final String identity;
  private final ClarificationDescription description;

  public Clarification(String identity, ClarificationDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public ClarificationDescription getDescription() {
    return description;
  }
}
