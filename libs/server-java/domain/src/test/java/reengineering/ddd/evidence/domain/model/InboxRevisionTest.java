package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.Map;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.InboxRevisionDescription;

class InboxRevisionTest {
  @Test
  void exposesIdentityAndDescription() {
    InboxRevisionDescription description =
        new InboxRevisionDescription(
            null,
            1,
            "Title",
            "Body",
            Inbox.ContentType.TEXT_PLAIN,
            null,
            Map.of(),
            null,
            null,
            "sha256:revision");

    InboxRevision revision = new InboxRevision("revision-1", description);

    assertEquals("revision-1", revision.getIdentity());
    assertSame(description, revision.getDescription());
  }
}
