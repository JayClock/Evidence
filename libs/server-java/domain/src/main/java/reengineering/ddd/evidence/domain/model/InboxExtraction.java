package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.InboxExtractionDescription;

public final class InboxExtraction implements Entity<String, InboxExtractionDescription> {
  private final String identity;
  private final InboxExtractionDescription description;

  public InboxExtraction(String identity, InboxExtractionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public InboxExtractionDescription getDescription() {
    return description;
  }
}
