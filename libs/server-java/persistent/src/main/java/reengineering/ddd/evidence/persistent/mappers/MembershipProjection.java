package reengineering.ddd.evidence.persistent.mappers;

import reengineering.ddd.evidence.domain.model.Member;
import reengineering.ddd.evidence.domain.model.Users;
import reengineering.ddd.evidence.domain.model.Workspace;

public final class MembershipProjection {
  private Member member;
  private Workspace workspace;

  public MembershipProjection() {}

  public Users.MembershipView toDomain() {
    return new Users.MembershipView(member, workspace);
  }
}
