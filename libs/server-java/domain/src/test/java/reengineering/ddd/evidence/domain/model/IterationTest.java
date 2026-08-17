package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.IterationDescription;

class IterationTest {
  @Test
  void exposesIdentityAndDescription() {
    Instant now = Instant.parse("2026-01-01T00:00:00Z");
    IterationDescription description =
        new IterationDescription(
            "IT-001",
            new Ref<>("workspace-1"),
            new Ref<>("candidate-1"),
            "sha256:candidate",
            "active",
            "kickoff",
            "proposal",
            "default",
            1,
            null,
            null,
            null,
            null,
            new Ref<>("user-1"),
            now,
            now);

    Iteration iteration = new Iteration("iteration-1", description);

    assertEquals("iteration-1", iteration.getIdentity());
    assertSame(description, iteration.getDescription());
  }
}
