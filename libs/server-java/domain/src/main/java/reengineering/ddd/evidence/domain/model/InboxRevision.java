package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.InboxRevisionDescription;

public final class InboxRevision implements Entity<String, InboxRevisionDescription> {
  private final String identity;
  private final InboxRevisionDescription description;

  public InboxRevision(String identity, InboxRevisionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public InboxRevisionDescription getDescription() {
    return description;
  }
}
