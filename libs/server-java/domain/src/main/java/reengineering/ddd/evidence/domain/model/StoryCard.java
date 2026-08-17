package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.StoryCardDescription;

public final class StoryCard implements Entity<String, StoryCardDescription> {
  private final String identity;
  private final StoryCardDescription description;

  public StoryCard(String identity, StoryCardDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public StoryCardDescription getDescription() {
    return description;
  }
}
