package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.Map;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.DiagramNodeDescription;

class DiagramNodeTest {
  @Test
  void exposesIdentityAndDescription() {
    DiagramNodeDescription description =
        new DiagramNodeDescription(
            null,
            "fulfillment-node",
            null,
            null,
            new Diagram.Position(10, 20),
            null,
            null,
            Map.of(),
            null,
            null);

    DiagramNode node = new DiagramNode("node-1", description);

    assertEquals("node-1", node.getIdentity());
    assertSame(description, node.getDescription());
  }
}
