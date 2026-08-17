package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.StoryDescription;

public final class Story implements Entity<String, StoryDescription> {
  private final String identity;
  private final StoryDescription description;

  public Story(String identity, StoryDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public StoryDescription getDescription() {
    return description;
  }
}
