package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.ClarificationDescription;

class ClarificationTest {
  @Test
  void exposesIdentityAndDescription() {
    ClarificationDescription description =
        new ClarificationDescription(
            "Q-001",
            null,
            null,
            null,
            1,
            Understanding.ClarificationTarget.STORY,
            "Question?",
            Understanding.ClarificationStatus.PENDING,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "sha256:clarification");

    Clarification clarification = new Clarification("clarification-1", description);

    assertEquals("clarification-1", clarification.getIdentity());
    assertSame(description, clarification.getDescription());
  }
}
