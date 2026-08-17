package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.InboxStoryCandidateDecisionDescription;

class InboxStoryCandidateDecisionTest {
  @Test
  void exposesIdentityAndDescription() {
    InboxStoryCandidateDecisionDescription description =
        new InboxStoryCandidateDecisionDescription(
            "DEC-001",
            null,
            null,
            "sha256:candidate",
            InboxWorkflow.DecisionAction.DEFER,
            "Later",
            null,
            null,
            "sha256:decision");

    InboxStoryCandidateDecision decision =
        new InboxStoryCandidateDecision("decision-1", description);

    assertEquals("decision-1", decision.getIdentity());
    assertSame(description, decision.getDescription());
  }
}
