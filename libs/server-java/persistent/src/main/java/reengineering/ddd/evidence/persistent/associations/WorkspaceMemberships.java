package reengineering.ddd.evidence.persistent.associations;

import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.MembershipDescription;
import reengineering.ddd.evidence.domain.model.Membership;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.domain.validation.WorkspaceAccess;
import reengineering.ddd.evidence.persistent.mappers.UsersMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkspaceMembershipsMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkspacesMapper;

@AssociationMapping(entity = Workspace.class, field = "memberships", parentIdField = "workspaceId")
public class WorkspaceMemberships extends EntityList<String, Membership>
    implements Workspace.Memberships {
  private String workspaceId;

  @Inject private WorkspaceMembershipsMapper mapper;
  @Inject private UsersMapper users;
  @Inject private WorkspacesMapper workspaces;
  @Inject private Clock clock;

  @Override
  protected List<Membership> findEntities(int from, int to) {
    return mapper.findAll(workspaceId, from, Math.max(to - from, 0));
  }

  @Override
  protected Membership findEntity(String id) {
    return mapper.findByIdentity(workspaceId, id);
  }

  @Override
  public int size() {
    return mapper.countAll(workspaceId);
  }

  @Override
  public Membership add(MembershipDescription description) {
    if (!workspaceId.equals(description.workspace().id())) {
      throw DomainException.validation(
          "membership workspace "
              + description.workspace().id()
              + " does not match scoped workspace "
              + workspaceId);
    }
    String userId = description.user().id();
    if (users.findByIdentity(userId) == null) {
      throw DomainException.notFound("user " + userId + " not found");
    }
    if (workspaces.findByIdentity(workspaceId) == null) {
      throw DomainException.notFound("workspace " + workspaceId + " not found");
    }
    String membershipId = UUID.randomUUID().toString();
    try {
      mapper.insert(
          membershipId,
          workspaceId,
          new MembershipDescription(
              description.workspace(),
              description.user(),
              WorkspaceAccess.role(description.role(), WorkspaceAccess.Role.MEMBER),
              description.createdAt(),
              description.updatedAt()),
          timestamp());
    } catch (DuplicateKeyException error) {
      throw DomainException.conflict("user " + userId + " is already a workspace membership");
    }
    return require(membershipId);
  }

  @Override
  public Membership update(String membershipId, String role) {
    Membership current = require(membershipId);
    String normalizedRole = WorkspaceAccess.role(role, null);
    assertOwnerRemains(current.getDescription().role(), normalizedRole);
    mapper.update(workspaceId, membershipId, normalizedRole, timestamp());
    return require(membershipId);
  }

  @Override
  public void remove(String membershipId) {
    Membership current = require(membershipId);
    assertOwnerRemains(current.getDescription().role(), null);
    if (mapper.delete(workspaceId, membershipId) != 1) {
      throw DomainException.notFound("workspace membership " + membershipId + " not found");
    }
  }

  private Membership require(String membershipId) {
    return findByIdentity(membershipId)
        .orElseThrow(
            () -> DomainException.notFound("workspace membership " + membershipId + " not found"));
  }

  private void assertOwnerRemains(String currentRole, String nextRole) {
    if (!"owner".equals(currentRole) || "owner".equals(nextRole)) return;
    if (mapper.countOwners(workspaceId) <= 1) {
      throw DomainException.conflict("workspace must retain at least one owner");
    }
  }

  private Instant timestamp() {
    return clock.instant().truncatedTo(ChronoUnit.MILLIS);
  }
}
