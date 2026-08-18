package reengineering.ddd.evidence.application;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.MembershipDescription;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;
import reengineering.ddd.evidence.domain.model.Clarification;
import reengineering.ddd.evidence.domain.model.Delivery;
import reengineering.ddd.evidence.domain.model.Inbox;
import reengineering.ddd.evidence.domain.model.InboxExtraction;
import reengineering.ddd.evidence.domain.model.InboxItem;
import reengineering.ddd.evidence.domain.model.InboxRevision;
import reengineering.ddd.evidence.domain.model.InboxStoryCandidate;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.domain.model.IterationIntake;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;
import reengineering.ddd.evidence.domain.model.KickoffProposal;
import reengineering.ddd.evidence.domain.model.Membership;
import reengineering.ddd.evidence.domain.model.NoModelImpact;
import reengineering.ddd.evidence.domain.model.Pair;
import reengineering.ddd.evidence.domain.model.Respond;
import reengineering.ddd.evidence.domain.model.ScenarioProposal;
import reengineering.ddd.evidence.domain.model.Showcase;
import reengineering.ddd.evidence.domain.model.Story;
import reengineering.ddd.evidence.domain.model.StoryRevision;
import reengineering.ddd.evidence.domain.model.Tasking;
import reengineering.ddd.evidence.domain.model.TaskingPlanCandidate;
import reengineering.ddd.evidence.domain.model.Understanding;
import reengineering.ddd.evidence.domain.model.User;
import reengineering.ddd.evidence.domain.model.Users;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.domain.model.Workspaces;
import reengineering.ddd.evidence.domain.validation.WorkspaceAccess;
import reengineering.ddd.evidence.domain.validation.WorkspaceAccess.Permission;
import reengineering.ddd.evidence.domain.validation.WorkspaceAccess.Role;

@Service
@Transactional(readOnly = true)
public class WorkspaceService {
  private final Users users;
  private final Workspaces workspaces;
  private final LocalInstallation localInstallation;

  public WorkspaceService(Users users, Workspaces workspaces, LocalInstallation localInstallation) {
    this.users = users;
    this.workspaces = workspaces;
    this.localInstallation = localInstallation;
  }

  private User requireActor(String actorUserId) {
    return users
        .findByIdentity(actorUserId)
        .orElseThrow(() -> DomainException.notFound("user " + actorUserId + " not found"));
  }

  public Workspace requireWorkspace(String actorUserId, String workspaceId, Permission permission) {
    User actor = requireActor(actorUserId);
    Membership membership =
        actor
            .memberships()
            .findByWorkspaceIdentity(workspaceId)
            .orElseThrow(() -> DomainException.notFound("workspace " + workspaceId + " not found"));
    if (!WorkspaceAccess.allows(membership.getDescription().role(), permission)) {
      throw DomainException.forbidden(
          "workspace "
              + workspaceId
              + " does not allow "
              + permission.name().toLowerCase()
              + " access");
    }
    return workspaces
        .findByIdentity(actorUserId, workspaceId)
        .orElseThrow(() -> DomainException.notFound("workspace " + workspaceId + " not found"));
  }

  @Transactional
  public Workspace updateWorkspace(
      String actorUserId, String workspaceId, WorkspaceDescription description) {
    requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    return workspaces.update(workspaceId, description);
  }

  @Transactional
  public void deleteWorkspace(String actorUserId, String workspaceId) {
    requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    workspaces.delete(workspaceId);
  }

  public MembershipPage workspaceMemberships(
      String actorUserId, String workspaceId, int page, int pageSize) {
    validatePage(page, pageSize);
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.READ);
    int total = workspace.memberships().findAll().size();
    int from = (page - 1) * pageSize;
    int to = Math.min(from + pageSize, total);
    List<Membership> memberships =
        from >= total
            ? List.of()
            : workspace.memberships().findAll().subCollection(from, to).stream().toList();
    return new MembershipPage(workspace, memberships, total);
  }

  public Membership requireMembership(String actorUserId, String workspaceId, String membershipId) {
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.READ);
    return workspace
        .memberships()
        .findByIdentity(membershipId)
        .orElseThrow(
            () -> DomainException.notFound("workspace membership " + membershipId + " not found"));
  }

  @Transactional
  public Membership addMembership(
      String actorUserId, String workspaceId, String userId, String role) {
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    return workspace.addMembership(
        new MembershipDescription(
            new Ref<>(workspaceId),
            new Ref<>(userId),
            WorkspaceAccess.role(role, Role.MEMBER),
            Instant.EPOCH,
            Instant.EPOCH));
  }

  @Transactional
  public Membership updateMembership(
      String actorUserId, String workspaceId, String membershipId, String role) {
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    requireMembership(actorUserId, workspaceId, membershipId);
    return workspace.updateMembership(membershipId, role);
  }

  @Transactional
  public void removeMembership(String actorUserId, String workspaceId, String membershipId) {
    Workspace workspace = requireWorkspace(actorUserId, workspaceId, Permission.MANAGE);
    requireMembership(actorUserId, workspaceId, membershipId);
    workspace.removeMembership(membershipId);
  }

  public Inbox.Page<InboxItem> inboxItems(
      String actorUserId, String workspaceId, Inbox.ListQuery query) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ).listInboxItems(query);
  }

  public InboxItem requireInboxItem(String actorUserId, String workspaceId, String itemId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .inboxItems()
        .findByIdentity(itemId)
        .orElseThrow(() -> DomainException.notFound("Inbox item " + itemId + " not found"));
  }

  @Transactional
  public Inbox.Captured captureInboxItem(
      String actorUserId, String workspaceId, Inbox.SourceInput source) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE).captureInboxItem(source);
  }

  @Transactional
  public InboxItem changeInboxStatus(
      String actorUserId,
      String workspaceId,
      String itemId,
      Inbox.ItemStatus status,
      int expectedVersion) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .changeInboxItemStatus(itemId, status, expectedVersion);
  }

  public Inbox.Page<InboxRevision> inboxRevisions(
      String actorUserId, String workspaceId, String itemId, int page, int pageSize) {
    Inbox.validatePage(page, pageSize);
    var revisions = requireInboxItem(actorUserId, workspaceId, itemId).revisions().findAll();
    int total = revisions.size();
    int from = Math.min((page - 1) * pageSize, total);
    int to = Math.min(from + pageSize, total);
    return new Inbox.Page<>(revisions.subCollection(from, to).stream().toList(), total);
  }

  public InboxRevision requireInboxRevision(
      String actorUserId, String workspaceId, String itemId, String revisionId) {
    return requireInboxItem(actorUserId, workspaceId, itemId)
        .revisions()
        .findByIdentity(revisionId)
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
        .appendInboxRevision(itemId, source, expectedLatestRevisionSha256);
  }

  @Transactional
  public InboxExtraction createInboxExtraction(
      String actorUserId, String workspaceId, List<String> inboxItemIds) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .inboxWorkflow()
        .createExtraction(inboxItemIds, actorUserId);
  }

  public InboxExtraction requireInboxExtraction(
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

  public InboxStoryCandidate requireInboxCandidate(
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

  public Iteration requireIteration(String actorUserId, String workspaceId, String iterationId) {
    return requireIteration(actorUserId, workspaceId, iterationId, Permission.READ);
  }

  private Iteration requireIteration(
      String actorUserId, String workspaceId, String iterationId, Permission permission) {
    return requireWorkspace(actorUserId, workspaceId, permission)
        .iterations()
        .findIteration(iterationId)
        .orElseThrow(() -> DomainException.notFound("Iteration " + iterationId + " not found"));
  }

  public IterationIntake requireIterationIntake(
      String actorUserId, String workspaceId, String iterationId) {
    return requireIteration(actorUserId, workspaceId, iterationId).intake().get();
  }

  @Transactional
  public Iteration completeIterationProvisioning(
      String actorUserId,
      String workspaceId,
      String iterationId,
      IterationWorkflow.CompleteProvisioningInput input) {
    return requireIteration(actorUserId, workspaceId, iterationId, Permission.WRITE)
        .completeProvisioning(input);
  }

  @Transactional
  public Iteration failIterationProvisioning(
      String actorUserId,
      String workspaceId,
      String iterationId,
      IterationWorkflow.FailProvisioningInput input) {
    return requireIteration(actorUserId, workspaceId, iterationId, Permission.WRITE)
        .failProvisioning(input);
  }

  public IterationWorkflow.KickoffView requireKickoff(
      String actorUserId, String workspaceId, String iterationId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .iterations()
        .findKickoff(iterationId)
        .orElseThrow(() -> DomainException.notFound("Iteration " + iterationId + " not found"));
  }

  @Transactional
  public KickoffProposal proposeKickoffReplacement(
      String actorUserId,
      String workspaceId,
      String iterationId,
      int expectedVersion,
      InboxWorkflow.CandidateInput proposal) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .iterations()
        .proposeKickoffReplacement(iterationId, expectedVersion, proposal);
  }

  @Transactional
  public IterationWorkflow.KickoffDecisionResult decideKickoff(
      String actorUserId,
      String workspaceId,
      String iterationId,
      IterationWorkflow.KickoffDecisionInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .iterations()
        .decideKickoff(iterationId, input, actorUserId);
  }

  public Understanding.View requireUnderstanding(
      String actorUserId, String workspaceId, String iterationId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .understanding()
        .findUnderstanding(iterationId)
        .orElseThrow(() -> DomainException.notFound("Understanding " + iterationId + " not found"));
  }

  @Transactional
  public Clarification askClarification(
      String actorUserId, String workspaceId, String iterationId, Understanding.AskInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .understanding()
        .askClarification(iterationId, input);
  }

  @Transactional
  public Understanding.AnswerResult answerClarification(
      String actorUserId, String workspaceId, String iterationId, Understanding.AnswerInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .understanding()
        .answerClarification(iterationId, input, actorUserId);
  }

  @Transactional
  public ScenarioProposal proposeScenarios(
      String actorUserId,
      String workspaceId,
      String iterationId,
      Understanding.ProposeScenariosInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .understanding()
        .proposeScenarioSet(iterationId, input);
  }

  @Transactional
  public Understanding.DecisionResult decideUnderstanding(
      String actorUserId, String workspaceId, String iterationId, Understanding.DecideInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .understanding()
        .decideUnderstanding(iterationId, input, actorUserId);
  }

  public Tasking.View requireTasking(String actorUserId, String workspaceId, String iterationId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .tasking()
        .findTasking(iterationId)
        .orElseThrow(() -> DomainException.notFound("Tasking " + iterationId + " not found"));
  }

  @Transactional
  public NoModelImpact recordNoModelImpact(
      String actorUserId,
      String workspaceId,
      String iterationId,
      Tasking.RecordNoModelImpactInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .tasking()
        .recordNoModelImpact(iterationId, input, actorUserId);
  }

  @Transactional
  public TaskingPlanCandidate proposeTasking(
      String actorUserId, String workspaceId, String iterationId, Tasking.ProposeInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .tasking()
        .proposeTasking(iterationId, input);
  }

  @Transactional
  public Tasking.DecisionResult decideTasking(
      String actorUserId, String workspaceId, String iterationId, Tasking.DecideInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .tasking()
        .decideTasking(iterationId, input, actorUserId);
  }

  public Pair.View requirePair(String actorUserId, String workspaceId, String iterationId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .pair()
        .findPair(iterationId)
        .orElseThrow(() -> DomainException.notFound("Pair " + iterationId + " not found"));
  }

  @Transactional
  public Pair.StartResult startPair(
      String actorUserId, String workspaceId, String iterationId, Pair.StartInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .pair()
        .startPair(iterationId, input);
  }

  @Transactional
  public Pair.ClaimLeaseResult claimPairLease(
      String actorUserId, String workspaceId, String iterationId, Pair.ClaimLeaseInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .pair()
        .claimPairLease(iterationId, input);
  }

  @Transactional
  public Pair.Run heartbeatPairLease(
      String actorUserId, String workspaceId, String iterationId, Pair.HeartbeatLeaseInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .pair()
        .heartbeatPairLease(iterationId, input);
  }

  @Transactional
  public Pair.ActionResult recordPairDriverAttempt(
      String actorUserId, String workspaceId, String iterationId, Pair.DriverAttemptInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .pair()
        .recordPairDriverAttempt(iterationId, input);
  }

  @Transactional
  public Pair.ActionResult recordPairCommandObservation(
      String actorUserId,
      String workspaceId,
      String iterationId,
      Pair.CommandObservationInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .pair()
        .recordPairCommandObservation(iterationId, input);
  }

  @Transactional
  public Pair.ActionResult recordPairRedReview(
      String actorUserId, String workspaceId, String iterationId, Pair.RedReviewInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .pair()
        .recordPairRedReview(iterationId, input);
  }

  @Transactional
  public Pair.ActionResult recordPairException(
      String actorUserId, String workspaceId, String iterationId, Pair.ExceptionInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .pair()
        .recordPairException(iterationId, input);
  }

  @Transactional
  public Pair.ActionResult decidePair(
      String actorUserId, String workspaceId, String iterationId, Pair.DecideInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .pair()
        .decidePair(iterationId, input, actorUserId);
  }

  public Showcase.View requireShowcase(String actorUserId, String workspaceId, String iterationId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .showcase()
        .findShowcase(iterationId)
        .orElseThrow(() -> DomainException.notFound("Showcase " + iterationId + " not found"));
  }

  @Transactional
  public Showcase.ActionResult recordShowcaseQ2(
      String actorUserId,
      String workspaceId,
      String iterationId,
      Showcase.Q2ObservationInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .showcase()
        .recordQ2Observation(iterationId, input);
  }

  @Transactional
  public Showcase.ActionResult recordShowcaseProduct(
      String actorUserId,
      String workspaceId,
      String iterationId,
      Showcase.ProductObservationInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .showcase()
        .recordProductObservation(iterationId, input, actorUserId);
  }

  @Transactional
  public Showcase.ActionResult recordShowcaseRisk(
      String actorUserId,
      String workspaceId,
      String iterationId,
      Showcase.RiskDecisionInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .showcase()
        .recordRiskDecision(iterationId, input, actorUserId);
  }

  @Transactional
  public Showcase.ActionResult recordShowcaseEvaluation(
      String actorUserId, String workspaceId, String iterationId, Showcase.EvaluationInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .showcase()
        .recordEvaluation(iterationId, input, actorUserId);
  }

  @Transactional
  public Showcase.ActionResult recordShowcaseReview(
      String actorUserId, String workspaceId, String iterationId, Showcase.ReviewInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .showcase()
        .recordReview(iterationId, input);
  }

  @Transactional
  public Showcase.ActionResult decideShowcase(
      String actorUserId, String workspaceId, String iterationId, Showcase.DecideInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .showcase()
        .decideShowcase(iterationId, input, actorUserId);
  }

  public Respond.View requireRespond(String actorUserId, String workspaceId, String iterationId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .respond()
        .findRespond(iterationId)
        .orElseThrow(() -> DomainException.notFound("Respond " + iterationId + " not found"));
  }

  @Transactional
  public Respond.ActionResult proposeRespondCandidate(
      String actorUserId, String workspaceId, String iterationId, Respond.ProposeInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .respond()
        .proposeRespondCandidate(iterationId, input);
  }

  @Transactional
  public Respond.ActionResult decideRespond(
      String actorUserId, String workspaceId, String iterationId, Respond.DecideInput input) {
    return requireWorkspace(actorUserId, workspaceId, Permission.WRITE)
        .respond()
        .decideRespond(iterationId, input, actorUserId);
  }

  public Delivery.Page<Story> stories(
      String actorUserId, String workspaceId, int page, int pageSize) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .delivery()
        .listStories(page, pageSize);
  }

  public Delivery.PortfolioSummary storySummary(String actorUserId, String workspaceId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .delivery()
        .summarizeStories();
  }

  public Story requireStory(String actorUserId, String workspaceId, String storyId) {
    return requireWorkspace(actorUserId, workspaceId, Permission.READ)
        .delivery()
        .findStory(storyId)
        .orElseThrow(() -> DomainException.notFound("Story " + storyId + " not found"));
  }

  public Delivery.Page<StoryRevision> storyRevisions(
      String actorUserId, String workspaceId, String storyId, int page, int pageSize) {
    validatePage(page, pageSize);
    var revisions = requireStory(actorUserId, workspaceId, storyId).revisions().findAll();
    int total = revisions.size();
    int from = Math.min((page - 1) * pageSize, total);
    int to = Math.min(from + pageSize, total);
    return new Delivery.Page<>(revisions.subCollection(from, to).stream().toList(), total);
  }

  public StoryRevision requireStoryRevision(
      String actorUserId, String workspaceId, String storyId, String revisionId) {
    return requireStory(actorUserId, workspaceId, storyId)
        .revisions()
        .findByIdentity(revisionId)
        .orElseThrow(() -> DomainException.notFound("Story Revision " + revisionId + " not found"));
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

  public record MembershipPage(Workspace workspace, List<Membership> items, int total) {
    public MembershipPage {
      items = List.copyOf(items);
    }
  }
}
