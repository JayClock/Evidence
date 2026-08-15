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
import reengineering.ddd.evidence.domain.model.Inbox;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Iteration;
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

  public Inbox.Page<Inbox.Item> inboxItems(
      String actorUserId, String workspaceId, Inbox.ListQuery query) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ).inbox().list(query);
  }

  public Inbox.Item requireInboxItem(String actorUserId, String workspaceId, String itemId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .inbox()
        .findByIdentity(itemId)
        .orElseThrow(() -> DomainException.notFound("Inbox item " + itemId + " not found"));
  }

  @Transactional
  public Inbox.Captured captureInboxItem(
      String actorUserId, String workspaceId, Inbox.SourceInput source) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE).inbox().capture(source);
  }

  @Transactional
  public Inbox.Item changeInboxStatus(
      String actorUserId,
      String workspaceId,
      String itemId,
      Inbox.ItemStatus status,
      int expectedVersion) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .inbox()
        .changeStatus(itemId, status, expectedVersion);
  }

  public Inbox.Page<Inbox.Revision> inboxRevisions(
      String actorUserId, String workspaceId, String itemId, int page, int pageSize) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .inbox()
        .listRevisions(itemId, page, pageSize);
  }

  public Inbox.Revision requireInboxRevision(
      String actorUserId, String workspaceId, String itemId, String revisionId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .inbox()
        .findRevision(itemId, revisionId)
        .orElseThrow(() -> DomainException.notFound("Inbox revision " + revisionId + " not found"));
  }

  @Transactional
  public Inbox.Captured appendInboxRevision(
      String actorUserId,
      String workspaceId,
      String itemId,
      Inbox.SourceInput source,
      String expectedLatestRevisionSha256) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .inbox()
        .appendRevision(itemId, source, expectedLatestRevisionSha256);
  }

  @Transactional
  public InboxWorkflow.Extraction createInboxExtraction(
      String actorUserId, String workspaceId, List<String> inboxItemIds) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .inboxWorkflow()
        .createExtraction(inboxItemIds, actorUserId);
  }

  public InboxWorkflow.Extraction requireInboxExtraction(
      String actorUserId, String workspaceId, String extractionId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .inboxWorkflow()
        .findExtraction(extractionId)
        .orElseThrow(
            () -> DomainException.notFound("Inbox Extraction " + extractionId + " not found"));
  }

  @Transactional
  public InboxWorkflow.ProposedCandidates proposeInboxCandidates(
      String actorUserId,
      String workspaceId,
      String extractionId,
      int expectedVersion,
      List<InboxWorkflow.CandidateInput> candidates) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .inboxWorkflow()
        .proposeCandidates(extractionId, expectedVersion, candidates);
  }

  public InboxWorkflow.CandidatePage inboxCandidates(
      String actorUserId, String workspaceId, InboxWorkflow.CandidateListQuery query) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .inboxWorkflow()
        .listCandidates(query);
  }

  public InboxWorkflow.Candidate requireInboxCandidate(
      String actorUserId, String workspaceId, String candidateId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .inboxWorkflow()
        .findCandidate(candidateId)
        .orElseThrow(
            () -> DomainException.notFound("Inbox Candidate " + candidateId + " not found"));
  }

  @Transactional
  public InboxWorkflow.CandidateDecision decideInboxCandidate(
      String actorUserId,
      String workspaceId,
      String candidateId,
      String candidateSha256,
      InboxWorkflow.DecisionAction action,
      String reason) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .inboxWorkflow()
        .decideCandidate(candidateId, candidateSha256, action, reason, actorUserId);
  }

  @Transactional
  public Iteration selectInboxCandidate(
      String actorUserId, String workspaceId, InboxWorkflow.SelectCandidateInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .inboxWorkflow()
        .selectCandidate(input, actorUserId);
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
