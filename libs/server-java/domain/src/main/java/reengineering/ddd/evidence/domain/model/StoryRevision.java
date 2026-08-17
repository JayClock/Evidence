package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.StoryRevisionDescription;

public final class StoryRevision implements Entity<String, StoryRevisionDescription> {
  private final String identity;
  private final StoryRevisionDescription description;

  public StoryRevision(String identity, StoryRevisionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public StoryRevisionDescription getDescription() {
    return description;
  }
}
