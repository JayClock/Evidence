package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import reengineering.ddd.evidence.domain.description.InboxItemDescription;

public final class InboxItem implements Entity<String, InboxItemDescription> {
  private String identity;
  private InboxItemDescription description;
  private Revisions revisions;

  public InboxItem(String identity, InboxItemDescription description, Revisions revisions) {
    this.identity = identity;
    this.description = description;
    this.revisions = revisions;
  }

  private InboxItem() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public InboxItemDescription getDescription() {
    return description;
  }

  public HasMany<String, InboxRevision> revisions() {
    return revisions;
  }

  public interface Revisions extends HasMany<String, InboxRevision> {}
}
