package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.KickoffProposalDescription;

public final class KickoffProposal implements Entity<String, KickoffProposalDescription> {
  private final String identity;
  private final KickoffProposalDescription description;

  public KickoffProposal(String identity, KickoffProposalDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public KickoffProposalDescription getDescription() {
    return description;
  }
}
