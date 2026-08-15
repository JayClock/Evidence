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
import reengineering.ddd.evidence.domain.description.MemberDescription;
import reengineering.ddd.evidence.domain.model.Member;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.domain.validation.WorkspaceAccess;
import reengineering.ddd.evidence.persistent.mappers.UsersMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkspaceMembersMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkspacesMapper;

@AssociationMapping(entity = Workspace.class, field = "members", parentIdField = "workspaceId")
public class WorkspaceMembers extends EntityList<String, Member> implements Workspace.Members {
  private String workspaceId;

  @Inject private WorkspaceMembersMapper mapper;
  @Inject private UsersMapper users;
  @Inject private WorkspacesMapper workspaces;
  @Inject private Clock clock;

  @Override
  protected List<Member> findEntities(int from, int to) {
    return mapper.findAll(workspaceId, from, Math.max(to - from, 0));
  }

  @Override
  protected Member findEntity(String id) {
    return mapper.findByIdentity(workspaceId, id);
  }

  @Override
  public int size() {
    return mapper.countAll(workspaceId);
  }

  @Override
  public Member add(MemberDescription description) {
    if (!workspaceId.equals(description.workspace().id())) {
      throw DomainException.validation(
          "member workspace "
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
    String memberId = UUID.randomUUID().toString();
    try {
      mapper.insert(
          memberId,
          workspaceId,
          new MemberDescription(
              description.workspace(),
              description.user(),
              WorkspaceAccess.role(description.role(), WorkspaceAccess.Role.MEMBER),
              description.createdAt(),
              description.updatedAt()),
          timestamp());
    } catch (DuplicateKeyException error) {
      throw DomainException.conflict("user " + userId + " is already a workspace member");
    }
    return require(memberId);
  }

  @Override
  public Member update(String memberId, String role) {
    Member current = require(memberId);
    String normalizedRole = WorkspaceAccess.role(role, null);
    assertOwnerRemains(current.getDescription().role(), normalizedRole);
    mapper.update(workspaceId, memberId, normalizedRole, timestamp());
    return require(memberId);
  }

  @Override
  public void remove(String memberId) {
    Member current = require(memberId);
    assertOwnerRemains(current.getDescription().role(), null);
    if (mapper.delete(workspaceId, memberId) != 1) {
      throw DomainException.notFound("workspace member " + memberId + " not found");
    }
  }

  private Member require(String memberId) {
    return findByIdentity(memberId)
        .orElseThrow(() -> DomainException.notFound("workspace member " + memberId + " not found"));
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
