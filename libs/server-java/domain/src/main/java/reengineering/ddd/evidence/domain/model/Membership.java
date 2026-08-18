package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.MembershipDescription;

public class Membership implements Entity<String, MembershipDescription> {
  private String identity;
  private MembershipDescription description;

  public Membership(String identity, MembershipDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private Membership() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public MembershipDescription getDescription() {
    return description;
  }
}
