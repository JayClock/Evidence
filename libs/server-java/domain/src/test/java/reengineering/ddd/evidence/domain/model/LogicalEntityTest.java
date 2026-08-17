package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.LogicalEntityDescription;

class LogicalEntityTest {
  @Test
  void exposesIdentityAndCopiesDescriptionAttributes() {
    Instant now = Instant.parse("2026-01-01T00:00:00Z");
    List<LogicalEntityDescription.Attribute> attributes = new ArrayList<>();
    attributes.add(new LogicalEntityDescription.Attribute("id", "number", "Number", "text", null));
    LogicalEntityDescription description =
        new LogicalEntityDescription(
            new Ref<>("workspace-1"),
            LogicalEntityDescription.Type.EVIDENCE,
            "contract",
            "contract",
            "Contract",
            null,
            attributes,
            now,
            now);

    LogicalEntity entity = new LogicalEntity("entity-1", description);
    attributes.clear();

    assertEquals("entity-1", entity.getIdentity());
    assertSame(description, entity.getDescription());
    assertEquals(1, description.attributes().size());
  }
}
