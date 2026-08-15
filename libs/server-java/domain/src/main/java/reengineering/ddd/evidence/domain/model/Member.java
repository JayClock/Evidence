package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.MemberDescription;

public class Member implements Entity<String, MemberDescription> {
  private String identity;
  private MemberDescription description;

  public Member(String identity, MemberDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private Member() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public MemberDescription getDescription() {
    return description;
  }
}
