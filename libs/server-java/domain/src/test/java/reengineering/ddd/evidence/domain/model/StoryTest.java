package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.github.jayclock.smartdomain.core.Many;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.StoryDescription;

class StoryTest {
  @Test
  void exposesIdentityAndDescription() {
    StoryDescription description =
        new StoryDescription(
            null,
            null,
            "IT-001",
            "active",
            "understanding",
            "scenario",
            "Title",
            "Goal",
            null,
            1,
            2,
            3,
            null,
            new Delivery.Authority("human", "review"),
            1,
            1,
            null,
            null);

    Story.Revisions revisions = new EmptyRevisions();
    Story story = new Story("US-001", description, revisions);

    assertEquals("US-001", story.getIdentity());
    assertSame(description, story.getDescription());
    assertSame(revisions, story.revisions());
  }

  private static final class EmptyRevisions implements Story.Revisions {
    @Override
    public Many<StoryRevision> findAll() {
      throw new UnsupportedOperationException();
    }

    @Override
    public Optional<StoryRevision> findByIdentity(String revisionId) {
      return Optional.empty();
    }
  }
}
