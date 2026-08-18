package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.github.jayclock.smartdomain.core.Many;
import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.MembershipDescription;

class WorkspaceMembershipPolicyTest {
  private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

  @Test
  void rejectsDemotingTheLastOwnerBeforePersistence() {
    FakeMemberships memberships = new FakeMemberships(List.of(membership("owner-1", "owner")));
    Workspace workspace = workspace(memberships);

    DomainException error =
        assertThrows(DomainException.class, () -> workspace.updateMembership("owner-1", "member"));

    assertEquals(DomainException.Kind.CONFLICT, error.kind());
    assertEquals(0, memberships.updateCount);
  }

  @Test
  void rejectsRemovingTheLastOwnerBeforePersistence() {
    FakeMemberships memberships = new FakeMemberships(List.of(membership("owner-1", "owner")));
    Workspace workspace = workspace(memberships);

    DomainException error =
        assertThrows(DomainException.class, () -> workspace.removeMembership("owner-1"));

    assertEquals(DomainException.Kind.CONFLICT, error.kind());
    assertEquals(0, memberships.removeCount);
  }

  @Test
  void permitsOwnerChangesWhenAnotherOwnerRemains() {
    FakeMemberships memberships =
        new FakeMemberships(
            List.of(membership("owner-1", "owner"), membership("owner-2", "owner")));
    Workspace workspace = workspace(memberships);

    assertDoesNotThrow(() -> workspace.updateMembership("owner-1", "MEMBER"));
    assertDoesNotThrow(() -> workspace.removeMembership("owner-1"));

    assertEquals(1, memberships.updateCount);
    assertEquals(1, memberships.removeCount);
  }

  private static Workspace workspace(Workspace.Memberships memberships) {
    return new Workspace(
        "workspace-1", null, memberships, null, null, null, null, null, null, null, null);
  }

  private static Membership membership(String id, String role) {
    return new Membership(
        id,
        new MembershipDescription(
            new Ref<>("workspace-1"), new Ref<>("user-" + id), role, NOW, NOW));
  }

  private static final class FakeMemberships implements Workspace.Memberships {
    private final List<Membership> values;
    private int updateCount;
    private int removeCount;

    private FakeMemberships(List<Membership> values) {
      this.values = values;
    }

    @Override
    public Many<Membership> findAll() {
      return new MembershipMany(values);
    }

    @Override
    public Optional<Membership> findByIdentity(String membershipId) {
      return values.stream()
          .filter(membership -> membership.getIdentity().equals(membershipId))
          .findFirst();
    }

    @Override
    public Membership add(MembershipDescription description) {
      throw new UnsupportedOperationException();
    }

    @Override
    public Membership update(String membershipId, String role) {
      updateCount++;
      return findByIdentity(membershipId).orElseThrow();
    }

    @Override
    public void remove(String membershipId) {
      removeCount++;
    }
  }

  private record MembershipMany(List<Membership> values) implements Many<Membership> {
    @Override
    public int size() {
      return values.size();
    }

    @Override
    public Many<Membership> subCollection(int from, int to) {
      return new MembershipMany(values.subList(from, to));
    }

    @Override
    public Iterator<Membership> iterator() {
      return values.iterator();
    }
  }
}
