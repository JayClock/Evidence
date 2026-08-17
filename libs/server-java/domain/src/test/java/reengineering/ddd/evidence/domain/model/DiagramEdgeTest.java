package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.Map;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.DiagramEdgeDescription;

class DiagramEdgeTest {
  @Test
  void exposesIdentityAndDescription() {
    DiagramEdgeDescription description =
        new DiagramEdgeDescription(
            null,
            null,
            null,
            null,
            null,
            null,
            "animated",
            Map.of(),
            Map.of(),
            true,
            false,
            null,
            null,
            Map.of(),
            null,
            null,
            null);

    DiagramEdge edge = new DiagramEdge("edge-1", description);

    assertEquals("edge-1", edge.getIdentity());
    assertSame(description, edge.getDescription());
  }
}
