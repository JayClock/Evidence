package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.InboxStoryCandidateDescription;

class InboxStoryCandidateTest {
  @Test
  void exposesIdentityAndDescription() {
    InboxStoryCandidateDescription description =
        new InboxStoryCandidateDescription(
            "CAND-001",
            null,
            null,
            "Title",
            "Problem",
            "Role",
            "Goal",
            "Value",
            null,
            List.of(),
            "sha256:candidate",
            InboxWorkflow.CandidateStatus.READY,
            "agent",
            null,
            null,
            null);

    InboxStoryCandidate candidate = new InboxStoryCandidate("candidate-1", description);

    assertEquals("candidate-1", candidate.getIdentity());
    assertSame(description, candidate.getDescription());
  }
}
