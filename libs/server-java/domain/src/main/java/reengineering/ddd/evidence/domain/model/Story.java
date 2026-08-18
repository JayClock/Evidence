package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import reengineering.ddd.evidence.domain.description.StoryDescription;

public final class Story implements Entity<String, StoryDescription> {
  private String identity;
  private StoryDescription description;
  private Revisions revisions;

  public Story(String identity, StoryDescription description, Revisions revisions) {
    this.identity = identity;
    this.description = description;
    this.revisions = revisions;
  }

  private Story() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public StoryDescription getDescription() {
    return description;
  }

  public HasMany<String, StoryRevision> revisions() {
    return revisions;
  }

  public interface Revisions extends HasMany<String, StoryRevision> {}
}
