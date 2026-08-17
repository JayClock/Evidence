package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.DeskCheckDecisionDescription;

class DeskCheckDecisionTest {
  @Test
  void exposesIdentityAndDescription() {
    DeskCheckDecisionDescription description =
        new DeskCheckDecisionDescription(
            "DEC-001",
            null,
            null,
            "sha256:plan",
            Tasking.DeskCheckAction.APPROVE,
            null,
            null,
            null,
            "sha256:decision");

    DeskCheckDecision decision = new DeskCheckDecision("decision-1", description);

    assertEquals("decision-1", decision.getIdentity());
    assertSame(description, decision.getDescription());
  }
}
