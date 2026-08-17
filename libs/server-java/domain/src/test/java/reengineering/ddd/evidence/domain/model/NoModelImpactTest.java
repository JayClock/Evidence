package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.NoModelImpactDescription;

class NoModelImpactTest {
  @Test
  void exposesIdentityAndDescription() {
    NoModelImpactDescription description =
        new NoModelImpactDescription(
            "NMI-001",
            null,
            null,
            null,
            "sha256:story",
            "No model impact",
            null,
            null,
            "sha256:decision");

    NoModelImpact decision = new NoModelImpact("no-model-impact-1", description);

    assertEquals("no-model-impact-1", decision.getIdentity());
    assertSame(description, decision.getDescription());
  }
}
