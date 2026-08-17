package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.ApprovedTaskingPlanDescription;

class ApprovedTaskingPlanTest {
  @Test
  void exposesIdentityAndDescription() {
    ApprovedTaskingPlanDescription description =
        new ApprovedTaskingPlanDescription(
            null, null, null, null, null, null, "sha256:approved-plan", null, null);

    ApprovedTaskingPlan plan = new ApprovedTaskingPlan("approved-plan-1", description);

    assertEquals("approved-plan-1", plan.getIdentity());
    assertSame(description, plan.getDescription());
  }
}
