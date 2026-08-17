package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

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

    Story story = new Story("US-001", description);

    assertEquals("US-001", story.getIdentity());
    assertSame(description, story.getDescription());
  }
}
