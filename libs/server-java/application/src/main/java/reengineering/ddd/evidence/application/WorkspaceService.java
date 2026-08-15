package reengineering.ddd.evidence.application;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.MemberDescription;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;
import reengineering.ddd.evidence.domain.model.Member;
import reengineering.ddd.evidence.domain.model.User;
import reengineering.ddd.evidence.domain.model.Users;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.domain.validation.WorkspaceAccess;
import reengineering.ddd.evidence.domain.validation.WorkspaceAccess.Permission;
import reengineering.ddd.evidence.domain.validation.WorkspaceAccess.Role;

@Service
@Transactional(readOnly = true)
public class WorkspaceService {
  private final Users users;
  private final LocalInstallation localInstallation;

  public WorkspaceService(Users users, LocalInstallation localInstallation) {
    this.users = users;
    this.localInstallation = localInstallation;
  }

  public User requireUser(String actorUserId, String requestedUserId) {
    if (!actorUserId.equals(requestedUserId)) {
      throw DomainException.notFound("user " + requestedUserId + " not found");
    }
    return users
        .findByIdentity(requestedUserId)
        .orElseThrow(() -> DomainException.notFound("user " + requestedUserId + " not found"));
  }

  public Users.MembershipPage memberships(
      String actorUserId, String requestedUserId, int page, int pageSize) {
    requireUser(actorUserId, requestedUserId);
    validatePage(page, pageSize);
    return users.memberships(requestedUserId).list(page, pageSize);
  }

  @Transactional
  public Workspace createWorkspace(String actorUserId, WorkspaceDescription description) {
    User owner = requireUser(actorUserId, actorUserId);
    return users.workspaces().create(owner.getIdentity(), description);
  }

  public Workspace requireWorkspace(String actorUserId, String workspaceId, Permission permission) {
    requireUser(actorUserId, actorUserId);
    Users.MembershipView membership =
        users
            .memberships(actorUserId)
            .findByWorkspaceIdentity(workspaceId)
            .orElseThrow(() -> DomainException.notFound("workspace " + workspaceId + " not found"));
    if (!WorkspaceAccess.allows(membership.member().getDescription().role(), permission)) {
      throw DomainException.forbidden(
          "workspace "
              + workspaceId
              + " does not allow "
              + permission.name().toLowerCase()
              + " access");
    }
    return membership.workspace();
  }

  @Transactional
  public Workspace updateWorkspace(
      String actorUserId, String workspaceId, WorkspaceDescription description) {
    requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    return users.workspaces().update(workspaceId, description);
  }

  @Transactional
  public void deleteWorkspace(String actorUserId, String workspaceId) {
    requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    users.workspaces().delete(workspaceId);
  }

  public MemberPage members(String actorUserId, String workspaceId, int page, int pageSize) {
    validatePage(page, pageSize);
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.READ);
    int total = workspace.members().findAll().size();
    int from = (page - 1) * pageSize;
    int to = Math.min(from + pageSize, total);
    List<Member> members =
        from >= total
            ? List.of()
            : workspace.members().findAll().subCollection(from, to).stream().toList();
    return new MemberPage(workspace, members, total);
  }

  public Member requireMember(String actorUserId, String workspaceId, String memberId) {
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.READ);
    return workspace
        .members()
        .findByIdentity(memberId)
        .orElseThrow(() -> DomainException.notFound("workspace member " + memberId + " not found"));
  }

  @Transactional
  public Member addMember(String actorUserId, String workspaceId, String userId, String role) {
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    return workspace.addMember(
        new MemberDescription(
            new Ref<>(workspaceId),
            new Ref<>(userId),
            WorkspaceAccess.role(role, Role.MEMBER),
            Instant.EPOCH,
            Instant.EPOCH));
  }

  @Transactional
  public Member updateMember(String actorUserId, String workspaceId, String memberId, String role) {
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    requireMember(actorUserId, workspaceId, memberId);
    return workspace.updateMember(memberId, role);
  }

  @Transactional
  public void removeMember(String actorUserId, String workspaceId, String memberId) {
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    requireMember(actorUserId, workspaceId, memberId);
    workspace.removeMember(memberId);
  }

  @Transactional
  public Optional<User> resolveExternalIdentity(
      Users.ExternalIdentity identity, boolean autoProvision) {
    Optional<User> existing = users.findByExternalIdentity(identity.key());
    if (existing.isPresent() || !autoProvision) return existing;
    return Optional.of(users.provisionExternalIdentity(identity));
  }

  @Transactional
  public void initializeLocalInstallation(LocalInstallation.Description description) {
    localInstallation.initialize(description);
  }

  private static void validatePage(int page, int pageSize) {
    if (page < 1 || pageSize < 1) {
      throw DomainException.validation("page and pageSize must be positive integers");
    }
  }

  public record MemberPage(Workspace workspace, List<Member> items, int total) {
    public MemberPage {
      items = List.copyOf(items);
    }
  }
}
