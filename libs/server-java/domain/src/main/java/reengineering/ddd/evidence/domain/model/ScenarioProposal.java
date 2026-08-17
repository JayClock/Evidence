package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.ScenarioProposalDescription;

public final class ScenarioProposal implements Entity<String, ScenarioProposalDescription> {
  private final String identity;
  private final ScenarioProposalDescription description;

  public ScenarioProposal(String identity, ScenarioProposalDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public ScenarioProposalDescription getDescription() {
    return description;
  }
}
