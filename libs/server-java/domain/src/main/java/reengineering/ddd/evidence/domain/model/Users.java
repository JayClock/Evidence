package reengineering.ddd.evidence.domain.model;

import java.util.List;
import java.util.Optional;

public interface Users {
  UserMemberships memberships(String userId);

  Optional<User> findByIdentity(String userId);

  Optional<User> findByExternalIdentity(ExternalIdentityKey identity);

  User provisionExternalIdentity(ExternalIdentity identity);

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

  record WorkspacePage(List<Workspace> items, int total) {
    public WorkspacePage {
      items = List.copyOf(items);
    }
  }
}
