package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.StoryCardDescription;

class StoryCardTest {
  @Test
  void exposesIdentityAndDescription() {
    StoryCardDescription description =
        new StoryCardDescription(
            null, null, 1, "Title", "Role", "Goal", "Value", null, "sha256:card", null);

    StoryCard card = new StoryCard("card-1", description);

    assertEquals("card-1", card.getIdentity());
    assertSame(description, card.getDescription());
  }
}
