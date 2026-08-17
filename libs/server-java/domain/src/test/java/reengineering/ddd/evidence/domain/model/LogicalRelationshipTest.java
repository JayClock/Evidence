package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.github.jayclock.smartdomain.core.Ref;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.LogicalRelationshipDescription;

class LogicalRelationshipTest {
  @Test
  void exposesIdentityAndDescription() {
    LogicalRelationshipDescription description =
        new LogicalRelationshipDescription(
            new Ref<>("workspace-1"), new Ref<>("source-1"), new Ref<>("target-1"), "fulfills");

    LogicalRelationship relationship = new LogicalRelationship("relationship-1", description);

    assertEquals("relationship-1", relationship.getIdentity());
    assertSame(description, relationship.getDescription());
  }
}
