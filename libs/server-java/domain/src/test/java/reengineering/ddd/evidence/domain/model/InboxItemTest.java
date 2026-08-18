package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.github.jayclock.smartdomain.core.Many;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.InboxItemDescription;

class InboxItemTest {
  @Test
  void exposesIdentityAndDescription() {
    InboxItemDescription description =
        new InboxItemDescription(
            null,
            "manual_text",
            "capture-1",
            "Title",
            Inbox.ItemStatus.ACTIVE,
            null,
            null,
            0,
            1,
            null,
            null);

    InboxItem.Revisions revisions = new EmptyRevisions();
    InboxItem item = new InboxItem("INBOX-0001", description, revisions);

    assertEquals("INBOX-0001", item.getIdentity());
    assertSame(description, item.getDescription());
    assertSame(revisions, item.revisions());
  }

  private static final class EmptyRevisions implements InboxItem.Revisions {
    @Override
    public Many<InboxRevision> findAll() {
      throw new UnsupportedOperationException();
    }

    @Override
    public Optional<InboxRevision> findByIdentity(String revisionId) {
      return Optional.empty();
    }
  }
}
