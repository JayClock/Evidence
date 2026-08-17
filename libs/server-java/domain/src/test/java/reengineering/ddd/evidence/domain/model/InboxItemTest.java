package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

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

    InboxItem item = new InboxItem("INBOX-0001", description);

    assertEquals("INBOX-0001", item.getIdentity());
    assertSame(description, item.getDescription());
  }
}
