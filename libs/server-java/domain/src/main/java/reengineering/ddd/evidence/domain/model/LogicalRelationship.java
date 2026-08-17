package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.LogicalRelationshipDescription;

public final class LogicalRelationship implements Entity<String, LogicalRelationshipDescription> {
  private final String identity;
  private final LogicalRelationshipDescription description;

  public LogicalRelationship(String identity, LogicalRelationshipDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public LogicalRelationshipDescription getDescription() {
    return description;
  }
}
