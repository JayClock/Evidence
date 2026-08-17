package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.InboxItemDescription;

public final class InboxItem implements Entity<String, InboxItemDescription> {
  private final String identity;
  private final InboxItemDescription description;

  public InboxItem(String identity, InboxItemDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public InboxItemDescription getDescription() {
    return description;
  }
}
