package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.ScenarioDraftDescription;

class ScenarioDraftTest {
  @Test
  void exposesIdentityAndDescription() {
    ScenarioDraftDescription description =
        new ScenarioDraftDescription(
            "SC-001",
            1,
            null,
            "Scenario",
            List.of("Given"),
            "When",
            List.of("Then"),
            List.of(),
            "sha256:scenario");

    ScenarioDraft draft = new ScenarioDraft("draft-1", description);

    assertEquals("draft-1", draft.getIdentity());
    assertSame(description, draft.getDescription());
  }
}
