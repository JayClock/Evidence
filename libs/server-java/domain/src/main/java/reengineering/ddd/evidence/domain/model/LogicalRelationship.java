package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasOne;
import reengineering.ddd.evidence.domain.description.LogicalRelationshipDescription;

public final class LogicalRelationship implements Entity<String, LogicalRelationshipDescription> {
  private final String identity;
  private final LogicalRelationshipDescription description;
  private final HasOne<LogicalEntity> source;
  private final HasOne<LogicalEntity> target;

  public LogicalRelationship(
      String identity,
      LogicalRelationshipDescription description,
      HasOne<LogicalEntity> source,
      HasOne<LogicalEntity> target) {
    this.identity = identity;
    this.description = description;
    this.source = source;
    this.target = target;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public LogicalRelationshipDescription getDescription() {
    return description;
  }

  public LogicalEntity source() {
    return source.get();
  }

  public LogicalEntity target() {
    return target.get();
  }
}
