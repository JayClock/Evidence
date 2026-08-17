package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.InboxStoryCandidateDescription;

public final class InboxStoryCandidate implements Entity<String, InboxStoryCandidateDescription> {
  private final String identity;
  private final InboxStoryCandidateDescription description;

  public InboxStoryCandidate(String identity, InboxStoryCandidateDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public InboxStoryCandidateDescription getDescription() {
    return description;
  }
}
