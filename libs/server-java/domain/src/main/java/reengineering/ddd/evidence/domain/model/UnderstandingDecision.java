package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.UnderstandingDecisionDescription;

public final class UnderstandingDecision
    implements Entity<String, UnderstandingDecisionDescription> {
  private final String identity;
  private final UnderstandingDecisionDescription description;

  public UnderstandingDecision(String identity, UnderstandingDecisionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public UnderstandingDecisionDescription getDescription() {
    return description;
  }
}
