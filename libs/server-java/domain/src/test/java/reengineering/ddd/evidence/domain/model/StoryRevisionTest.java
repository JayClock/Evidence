package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.StoryRevisionDescription;

class StoryRevisionTest {
  @Test
  void exposesIdentityAndDescription() {
    StoryRevisionDescription description =
        new StoryRevisionDescription(
            null,
            1,
            "Title",
            "Problem",
            "Role",
            "Goal",
            "Value",
            null,
            List.of(),
            List.of(),
            "sha256:revision",
            null,
            null);

    StoryRevision revision = new StoryRevision("revision-1", description);

    assertEquals("revision-1", revision.getIdentity());
    assertSame(description, revision.getDescription());
  }
}
