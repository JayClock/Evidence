package reengineering.ddd.evidence.persistent.associations;

import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Optional;
import reengineering.ddd.evidence.domain.model.InboxExtraction;
import reengineering.ddd.evidence.domain.model.InboxStoryCandidate;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.domain.model.Workspace;

@AssociationMapping(
    entity = Workspace.class,
    field = "inboxWorkflow",
    parentIdField = "workspaceId")
public final class WorkspaceInboxWorkflow implements Workspace.InboxWorkflowAssociation {
  private String workspaceId;
  @Inject private InboxWorkflowStore workflow;

  @Override
  public InboxExtraction createExtraction(List<String> inboxItemIds, String requestedByUserId) {
    return workflow.createExtraction(workspaceId, inboxItemIds, requestedByUserId);
  }

  @Override
  public Optional<InboxExtraction> findExtraction(String extractionId) {
    return workflow.findExtraction(workspaceId, extractionId);
  }

  @Override
  public InboxWorkflow.ProposedCandidates proposeCandidates(
      String extractionId, int expectedVersion, List<InboxWorkflow.CandidateInput> candidates) {
    return workflow.proposeCandidates(workspaceId, extractionId, expectedVersion, candidates);
  }

  @Override
  public InboxWorkflow.CandidatePage listCandidates(InboxWorkflow.CandidateListQuery query) {
    return workflow.listCandidates(workspaceId, query);
  }

  @Override
  public Optional<InboxStoryCandidate> findCandidate(String candidateId) {
    return workflow.findCandidate(workspaceId, candidateId);
  }

  @Override
  public InboxWorkflow.CandidateDecision decideCandidate(
      String candidateId,
      String candidateSha256,
      InboxWorkflow.DecisionAction action,
      String reason,
      String decidedByUserId) {
    return workflow.decideCandidate(
        workspaceId, candidateId, candidateSha256, action, reason, decidedByUserId);
  }

  @Override
  public Iteration selectCandidate(
      InboxWorkflow.SelectCandidateInput input, String selectedByUserId) {
    return workflow.selectCandidate(workspaceId, input, selectedByUserId);
  }
}
