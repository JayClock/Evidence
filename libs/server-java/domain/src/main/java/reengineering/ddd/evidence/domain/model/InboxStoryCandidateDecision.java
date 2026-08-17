package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.InboxStoryCandidateDecisionDescription;

public final class InboxStoryCandidateDecision
    implements Entity<String, InboxStoryCandidateDecisionDescription> {
  private final String identity;
  private final InboxStoryCandidateDecisionDescription description;

  public InboxStoryCandidateDecision(
      String identity, InboxStoryCandidateDecisionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public InboxStoryCandidateDecisionDescription getDescription() {
    return description;
  }
}
