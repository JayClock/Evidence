package reengineering.ddd.evidence.persistent.associations;

import java.util.Optional;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Membership;
import reengineering.ddd.evidence.domain.model.Users;
import reengineering.ddd.evidence.persistent.mappers.UserMembershipsMapper;

final class UserMemberships implements Users.UserMemberships {
  private final UserMembershipsMapper mapper;
  private final String userId;

  UserMemberships(UserMembershipsMapper mapper, String userId) {
    this.mapper = mapper;
    this.userId = userId;
  }

  @Override
  public Users.MembershipPage list(int page, int pageSize) {
    if (page < 1 || pageSize < 1) {
      throw DomainException.validation("page and pageSize must be positive integers");
    }
    return new Users.MembershipPage(
        mapper.findAll(userId, (page - 1) * pageSize, pageSize), mapper.countAll(userId));
  }

  @Override
  public Users.WorkspacePage listWorkspaces(int page, int pageSize) {
    if (page < 1 || pageSize < 1) {
      throw DomainException.validation("page and pageSize must be positive integers");
    }
    return new Users.WorkspacePage(
        mapper.findWorkspaces(userId, (page - 1) * pageSize, pageSize), mapper.countAll(userId));
  }

  @Override
  public Optional<Membership> findByWorkspaceIdentity(String workspaceId) {
    return Optional.ofNullable(mapper.findByWorkspaceIdentity(userId, workspaceId));
  }
}
