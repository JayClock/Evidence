package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.IterationIntakeDescription;

class IterationIntakeTest {
  @Test
  void exposesIdentityAndDescription() {
    IterationIntakeDescription description =
        new IterationIntakeDescription(
            null, null, List.of(), "Frozen requirements", "sha256:intake", null);

    IterationIntake intake = new IterationIntake("intake-1", description);

    assertEquals("intake-1", intake.getIdentity());
    assertSame(description, intake.getDescription());
  }
}
