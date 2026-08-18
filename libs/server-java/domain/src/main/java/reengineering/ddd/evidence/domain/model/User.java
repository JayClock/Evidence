package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import java.util.Optional;
import reengineering.ddd.evidence.domain.description.UserDescription;

public class User implements Entity<String, UserDescription> {
  private String identity;
  private UserDescription description;
  private Memberships memberships;

  public User(String identity, UserDescription description, Memberships memberships) {
    this.identity = identity;
    this.description = description;
    this.memberships = memberships;
  }

  private User() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public UserDescription getDescription() {
    return description;
  }

  public Memberships memberships() {
    return memberships;
  }

  public interface Memberships extends HasMany<String, Membership> {
    Optional<Membership> findByWorkspaceIdentity(String workspaceId);
  }
}
