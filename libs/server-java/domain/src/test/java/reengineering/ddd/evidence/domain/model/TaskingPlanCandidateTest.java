package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.TaskingPlanCandidateDescription;

class TaskingPlanCandidateTest {
  @Test
  void exposesIdentityAndDescription() {
    TaskingPlanCandidateDescription description =
        new TaskingPlanCandidateDescription(
            1,
            "PLAN-001",
            null,
            null,
            null,
            "sha256:story",
            "base-sha",
            null,
            null,
            1,
            null,
            "sha256:catalog",
            List.of(),
            List.of(),
            List.of(),
            null,
            "sha256:plan",
            null);

    TaskingPlanCandidate candidate = new TaskingPlanCandidate("candidate-1", description);

    assertEquals("candidate-1", candidate.getIdentity());
    assertSame(description, candidate.getDescription());
  }
}
