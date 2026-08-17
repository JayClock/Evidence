package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.MemberDescription;

class MemberTest {
  @Test
  void exposesIdentityAndDescription() {
    Instant now = Instant.parse("2026-01-01T00:00:00Z");
    MemberDescription description =
        new MemberDescription(new Ref<>("workspace-1"), new Ref<>("user-1"), "owner", now, now);

    Member member = new Member("member-1", description);

    assertEquals("member-1", member.getIdentity());
    assertSame(description, member.getDescription());
  }
}
