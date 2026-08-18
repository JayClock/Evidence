package reengineering.ddd.evidence.domain.model;

import java.util.List;
import java.util.Optional;

public interface Users {
  Optional<User> findByIdentity(String userId);

  Optional<User> findByExternalIdentity(ExternalIdentityKey identity);

  User provisionExternalIdentity(ExternalIdentity identity);

  record ExternalIdentityKey(String issuer, String subject) {}

  record ExternalIdentity(String issuer, String subject, String name, String email) {
    public ExternalIdentityKey key() {
      return new ExternalIdentityKey(issuer, subject);
    }
  }

  record WorkspacePage(List<Workspace> items, int total) {
    public WorkspacePage {
      items = List.copyOf(items);
    }
  }
}
