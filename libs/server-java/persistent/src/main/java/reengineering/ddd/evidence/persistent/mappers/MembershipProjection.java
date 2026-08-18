package reengineering.ddd.evidence.persistent.mappers;

import reengineering.ddd.evidence.domain.model.Membership;
import reengineering.ddd.evidence.domain.model.Users;
import reengineering.ddd.evidence.domain.model.Workspace;

public final class MembershipProjection {
  private Membership membership;
  private Workspace workspace;

  public MembershipProjection() {}

  public Users.MembershipView toDomain() {
    return new Users.MembershipView(membership, workspace);
  }
}
