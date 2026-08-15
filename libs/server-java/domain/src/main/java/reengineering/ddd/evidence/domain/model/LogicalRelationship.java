package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.Ref;

public final class LogicalRelationship implements Entity<String, LogicalRelationship.Description> {
  private final String identity;
  private final Description description;

  public LogicalRelationship(String identity, Description description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public Description getDescription() {
    return description;
  }

  public record Description(
      Ref<String> workspace, Ref<String> source, Ref<String> target, String label) {}
}
