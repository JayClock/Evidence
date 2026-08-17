package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.KickoffDecisionDescription;

public final class KickoffDecision implements Entity<String, KickoffDecisionDescription> {
  private final String identity;
  private final KickoffDecisionDescription description;

  public KickoffDecision(String identity, KickoffDecisionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public KickoffDecisionDescription getDescription() {
    return description;
  }
}
