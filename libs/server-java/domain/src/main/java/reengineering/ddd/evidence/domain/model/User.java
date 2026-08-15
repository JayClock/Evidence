package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.UserDescription;

public class User implements Entity<String, UserDescription> {
  private String identity;
  private UserDescription description;

  public User(String identity, UserDescription description) {
    this.identity = identity;
    this.description = description;
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
}
