package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.KickoffDecisionDescription;

class KickoffDecisionTest {
  @Test
  void exposesIdentityAndDescription() {
    KickoffDecisionDescription description =
        new KickoffDecisionDescription(
            "DEC-001",
            null,
            null,
            "sha256:proposal",
            IterationWorkflow.KickoffAction.CONFIRM,
            null,
            null,
            null,
            "sha256:decision");

    KickoffDecision decision = new KickoffDecision("decision-1", description);

    assertEquals("decision-1", decision.getIdentity());
    assertSame(description, decision.getDescription());
  }
}
