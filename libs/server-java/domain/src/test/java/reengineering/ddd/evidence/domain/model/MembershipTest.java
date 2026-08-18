package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.MembershipDescription;

class MembershipTest {
  @Test
  void exposesIdentityAndDescription() {
    Instant now = Instant.parse("2026-01-01T00:00:00Z");
    MembershipDescription description =
        new MembershipDescription(new Ref<>("workspace-1"), new Ref<>("user-1"), "owner", now, now);

    Membership membership = new Membership("membership-1", description);

    assertEquals("membership-1", membership.getIdentity());
    assertSame(description, membership.getDescription());
  }
}
