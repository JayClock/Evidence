package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.DiagramDescription;

class DiagramTest {
  @Test
  void exposesIdentityAndDescription() {
    Instant now = Instant.parse("2026-01-01T00:00:00Z");
    DiagramDescription description =
        new DiagramDescription(
            new Ref<>("workspace-1"),
            "Model",
            DiagramDescription.Viewport.defaultViewport(),
            now,
            now);

    Diagram diagram = new Diagram("model", description, null, null);

    assertEquals("model", diagram.getIdentity());
    assertSame(description, diagram.getDescription());
    assertEquals(new DiagramDescription.Viewport(0, 0, 1), description.viewport());
  }
}
