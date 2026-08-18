package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.HasMany;
import java.util.List;
import java.util.Optional;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;

public interface Users {
  Workspaces workspaces();

  UserMemberships memberships(String userId);

  Optional<User> findByIdentity(String userId);

  Optional<User> findByExternalIdentity(ExternalIdentityKey identity);

  User provisionExternalIdentity(ExternalIdentity identity);

  interface Workspaces extends HasMany<String, Workspace> {
    Workspace create(String ownerUserId, WorkspaceDescription description);

    Workspace update(String workspaceId, WorkspaceDescription description);

    void delete(String workspaceId);
  }

  interface UserMemberships {
    MembershipPage list(int page, int pageSize);

    Optional<MembershipView> findByWorkspaceIdentity(String workspaceId);
  }

  record ExternalIdentityKey(String issuer, String subject) {}

  record ExternalIdentity(String issuer, String subject, String name, String email) {
    public ExternalIdentityKey key() {
      return new ExternalIdentityKey(issuer, subject);
    }
  }

  record MembershipView(Membership membership, Workspace workspace) {}

  record MembershipPage(List<MembershipView> items, int total) {
    public MembershipPage {
      items = List.copyOf(items);
    }
  }
}
