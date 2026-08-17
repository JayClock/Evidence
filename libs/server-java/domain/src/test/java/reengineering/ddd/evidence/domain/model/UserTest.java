package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.UserDescription;

class UserTest {
  @Test
  void exposesIdentityAndDescription() {
    UserDescription description = new UserDescription("Ada", "ada@example.com");

    User user = new User("user-1", description);

    assertEquals("user-1", user.getIdentity());
    assertSame(description, user.getDescription());
  }
}
