package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.InboxExtractionDescription;

class InboxExtractionTest {
  @Test
  void exposesIdentityAndDescription() {
    InboxExtractionDescription description =
        new InboxExtractionDescription(
            "EXT-001",
            null,
            InboxWorkflow.ExtractionStatus.AWAITING_AGENT,
            List.of(),
            1,
            null,
            null,
            null,
            null);

    InboxExtraction extraction = new InboxExtraction("extraction-1", description);

    assertEquals("extraction-1", extraction.getIdentity());
    assertSame(description, extraction.getDescription());
  }
}
