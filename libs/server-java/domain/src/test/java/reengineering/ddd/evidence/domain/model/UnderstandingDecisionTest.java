package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.UnderstandingDecisionDescription;

class UnderstandingDecisionTest {
  @Test
  void exposesIdentityAndDescription() {
    UnderstandingDecisionDescription description =
        new UnderstandingDecisionDescription(
            "DEC-001",
            null,
            null,
            null,
            null,
            "sha256:proposal",
            Understanding.DecisionAction.CONFIRM,
            null,
            List.of(),
            List.of(),
            null,
            null,
            "sha256:decision");

    UnderstandingDecision decision = new UnderstandingDecision("decision-1", description);

    assertEquals("decision-1", decision.getIdentity());
    assertSame(description, decision.getDescription());
  }
}
