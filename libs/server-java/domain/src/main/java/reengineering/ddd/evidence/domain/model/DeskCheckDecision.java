package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.DeskCheckDecisionDescription;

public final class DeskCheckDecision implements Entity<String, DeskCheckDecisionDescription> {
  private final String identity;
  private final DeskCheckDecisionDescription description;

  public DeskCheckDecision(String identity, DeskCheckDecisionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public DeskCheckDecisionDescription getDescription() {
    return description;
  }
}
