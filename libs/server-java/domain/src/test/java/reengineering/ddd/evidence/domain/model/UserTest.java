package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.github.jayclock.smartdomain.core.Many;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.UserDescription;

class UserTest {
  @Test
  void exposesIdentityDescriptionAndMemberships() {
    UserDescription description = new UserDescription("Ada", "ada@example.com");
    User.Memberships memberships = new EmptyMemberships();

    User user = new User("user-1", description, memberships);

    assertEquals("user-1", user.getIdentity());
    assertSame(description, user.getDescription());
    assertSame(memberships, user.memberships());
  }

  private static final class EmptyMemberships implements User.Memberships {
    @Override
    public Many<Membership> findAll() {
      throw new UnsupportedOperationException();
    }

    @Override
    public Optional<Membership> findByIdentity(String membershipId) {
      return Optional.empty();
    }

    @Override
    public Users.WorkspacePage listWorkspaces(int page, int pageSize) {
      return new Users.WorkspacePage(List.of(), 0);
    }

    @Override
    public Optional<Membership> findByWorkspaceIdentity(String workspaceId) {
      return Optional.empty();
    }
  }
}
