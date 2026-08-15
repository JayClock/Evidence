package reengineering.ddd.evidence.persistent.mappers;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface WorkflowMapper {
  InboxRows.IterationRow findIteration(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  InboxRows.IterationRow lockIteration(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  WorkflowRows.IntakeRow findIntake(@Param("iterationId") String iterationId);

  int completeProvisioning(
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("expectedVersion") int expectedVersion,
      @Param("baseCommitSha") String baseCommitSha,
      @Param("branchName") String branchName,
      @Param("timestamp") Instant timestamp);

  int failProvisioning(
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("expectedVersion") int expectedVersion,
      @Param("reason") String reason,
      @Param("timestamp") Instant timestamp);

  int claimIteration(
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("expectedVersion") int expectedVersion,
      @Param("loop") String loop,
      @Param("stages") List<String> stages,
      @Param("newLifecycle") String newLifecycle,
      @Param("newLoop") String newLoop,
      @Param("newStage") String newStage,
      @Param("timestamp") Instant timestamp);

  int updateIterationStage(
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("stage") String stage,
      @Param("timestamp") Instant timestamp);

  List<WorkflowRows.KickoffProposalRow> findKickoffProposals(
      @Param("iterationId") String iterationId);

  WorkflowRows.KickoffProposalRow findKickoffProposal(
      @Param("iterationId") String iterationId, @Param("proposalId") String proposalId);

  int countKickoffProposals(@Param("iterationId") String iterationId);

  int insertKickoffProposal(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("iterationId") String iterationId,
      @Param("sequence") int sequence,
      @Param("origin") String origin,
      @Param("title") String title,
      @Param("problem") String problem,
      @Param("role") String role,
      @Param("goal") String goal,
      @Param("value") String value,
      @Param("cognitiveMode") String cognitiveMode,
      @Param("citations") String citations,
      @Param("contentSha256") String contentSha256,
      @Param("proposedAt") Instant proposedAt);

  List<WorkflowRows.KickoffDecisionRow> findKickoffDecisions(
      @Param("iterationId") String iterationId);

  int insertKickoffDecision(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("iterationId") String iterationId,
      @Param("proposalId") String proposalId,
      @Param("proposalSha256") String proposalSha256,
      @Param("action") String action,
      @Param("reason") String reason,
      @Param("decidedByUserId") String decidedByUserId,
      @Param("decidedAt") Instant decidedAt,
      @Param("contentSha256") String contentSha256);

  int insertStory(
      @Param("id") String id,
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("timestamp") Instant timestamp);

  int insertStoryRevision(
      @Param("id") String id,
      @Param("storyId") String storyId,
      @Param("revisionNumber") int revisionNumber,
      @Param("title") String title,
      @Param("problem") String problem,
      @Param("role") String role,
      @Param("goal") String goal,
      @Param("value") String value,
      @Param("cognitiveMode") String cognitiveMode,
      @Param("contentSha256") String contentSha256,
      @Param("createdByUserId") String createdByUserId,
      @Param("createdAt") Instant createdAt,
      @Param("understandingDecisionId") String understandingDecisionId);

  int insertStoryCitation(
      @Param("id") String id,
      @Param("storyRevisionId") String storyRevisionId,
      @Param("inboxRevisionId") String inboxRevisionId,
      @Param("position") int position,
      @Param("locator") String locator);

  int initializeStoryRevision(
      @Param("storyId") String storyId, @Param("revisionId") String revisionId);

  int setLatestStoryRevision(
      @Param("workspaceId") String workspaceId,
      @Param("storyId") String storyId,
      @Param("expectedVersion") int expectedVersion,
      @Param("expectedRevisionId") String expectedRevisionId,
      @Param("revisionId") String revisionId,
      @Param("timestamp") Instant timestamp);

  int insertProblemStatement(
      @Param("id") String id,
      @Param("storyId") String storyId,
      @Param("iterationId") String iterationId,
      @Param("title") String title,
      @Param("problem") String problem,
      @Param("cognitiveMode") String cognitiveMode,
      @Param("citations") String citations,
      @Param("contentSha256") String contentSha256,
      @Param("createdAt") Instant createdAt);

  int insertStoryCard(
      @Param("id") String id,
      @Param("storyId") String storyId,
      @Param("iterationId") String iterationId,
      @Param("problemStatementId") String problemStatementId,
      @Param("title") String title,
      @Param("role") String role,
      @Param("goal") String goal,
      @Param("value") String value,
      @Param("contentSha256") String contentSha256,
      @Param("createdAt") Instant createdAt);

  WorkflowRows.ProblemStatementRow findProblemStatement(@Param("id") String id);

  WorkflowRows.StoryCardRow findStoryCard(@Param("id") String id);

  WorkflowRows.StoryRow findStory(
      @Param("workspaceId") String workspaceId, @Param("storyId") String storyId);

  List<WorkflowRows.StoryRow> findStories(
      @Param("workspaceId") String workspaceId, @Param("from") int from, @Param("size") int size);

  List<WorkflowRows.StoryRow> findAllStories(@Param("workspaceId") String workspaceId);

  int countStories(@Param("workspaceId") String workspaceId);

  WorkflowRows.StoryRevisionRow findStoryRevision(
      @Param("workspaceId") String workspaceId,
      @Param("storyId") String storyId,
      @Param("revisionId") String revisionId);

  List<WorkflowRows.StoryRevisionRow> findStoryRevisions(
      @Param("workspaceId") String workspaceId,
      @Param("storyId") String storyId,
      @Param("from") int from,
      @Param("size") int size);

  int countStoryRevisions(
      @Param("workspaceId") String workspaceId, @Param("storyId") String storyId);

  List<WorkflowRows.StoryCitationRow> findStoryCitations(
      @Param("storyRevisionId") String storyRevisionId);

  List<WorkflowRows.StoryScenarioRow> findStoryScenarios(
      @Param("storyRevisionId") String storyRevisionId);

  List<WorkflowRows.ClarificationRow> findClarifications(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  WorkflowRows.ClarificationRow findPendingClarification(
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("clarificationId") String clarificationId);

  int countClarifications(@Param("iterationId") String iterationId);

  int insertClarification(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("storyId") String storyId,
      @Param("storyRevisionId") String storyRevisionId,
      @Param("sequence") int sequence,
      @Param("target") String target,
      @Param("question") String question,
      @Param("askedAt") Instant askedAt,
      @Param("contentSha256") String contentSha256);

  int answerClarification(
      @Param("id") String id,
      @Param("answer") String answer,
      @Param("answeredByUserId") String answeredByUserId,
      @Param("answeredAt") Instant answeredAt,
      @Param("contentSha256") String contentSha256);

  int waiveClarifications(
      @Param("iterationId") String iterationId,
      @Param("reason") String reason,
      @Param("waivedByUserId") String waivedByUserId,
      @Param("waivedAt") Instant waivedAt);

  WorkflowRows.ScenarioProposalRow findCurrentScenarioProposal(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  WorkflowRows.ScenarioProposalRow findScenarioProposal(
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("proposalId") String proposalId);

  int countScenarioProposals(@Param("iterationId") String iterationId);

  int insertScenarioProposal(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("storyId") String storyId,
      @Param("storyRevisionId") String storyRevisionId,
      @Param("sequence") int sequence,
      @Param("contentSha256") String contentSha256,
      @Param("proposedAt") Instant proposedAt);

  int insertScenarioDraft(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("proposalId") String proposalId,
      @Param("position") int position,
      @Param("title") String title,
      @Param("givenSteps") String givenSteps,
      @Param("whenStep") String whenStep,
      @Param("thenSteps") String thenSteps,
      @Param("businessData") String businessData,
      @Param("contentSha256") String contentSha256);

  List<WorkflowRows.ScenarioDraftRow> findScenarioDrafts(@Param("proposalId") String proposalId);

  List<WorkflowRows.UnderstandingDecisionRow> findUnderstandingDecisions(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  int countUnderstandingDecisions(@Param("iterationId") String iterationId);

  int insertUnderstandingDecision(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("storyId") String storyId,
      @Param("storyRevisionId") String storyRevisionId,
      @Param("proposalId") String proposalId,
      @Param("proposalSha256") String proposalSha256,
      @Param("action") String action,
      @Param("reason") String reason,
      @Param("selectedDraftIds") String selectedDraftIds,
      @Param("confirmedScenarioIds") String confirmedScenarioIds,
      @Param("decidedByUserId") String decidedByUserId,
      @Param("decidedAt") Instant decidedAt,
      @Param("contentSha256") String contentSha256);

  int countStoryScenarios(@Param("storyId") String storyId);

  int insertStoryScenario(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("storyRevisionId") String storyRevisionId,
      @Param("sourceDraftId") String sourceDraftId,
      @Param("understandingDecisionId") String understandingDecisionId,
      @Param("position") int position,
      @Param("title") String title,
      @Param("givenSteps") String givenSteps,
      @Param("whenStep") String whenStep,
      @Param("thenSteps") String thenSteps,
      @Param("businessData") String businessData,
      @Param("confirmedAt") Instant confirmedAt);

  WorkflowRows.NoModelImpactRow findNoModelImpact(
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("storyRevisionId") String storyRevisionId);

  WorkflowRows.NoModelImpactRow findNoModelImpactByRevision(
      @Param("storyRevisionId") String storyRevisionId);

  int countNoModelImpact(@Param("iterationId") String iterationId);

  int insertNoModelImpact(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("storyId") String storyId,
      @Param("storyRevisionId") String storyRevisionId,
      @Param("storyRevisionSha256") String storyRevisionSha256,
      @Param("reason") String reason,
      @Param("decidedByUserId") String decidedByUserId,
      @Param("decidedAt") Instant decidedAt,
      @Param("contentSha256") String contentSha256);

  WorkflowRows.TaskingCandidateRow findCurrentTaskingCandidate(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  WorkflowRows.TaskingCandidateRow findTaskingCandidate(
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("candidateId") String candidateId);

  int countTaskingCandidates(@Param("iterationId") String iterationId);

  int insertTaskingCandidate(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("storyId") String storyId,
      @Param("storyRevisionId") String storyRevisionId,
      @Param("storyRevisionSha256") String storyRevisionSha256,
      @Param("baseCommitSha") String baseCommitSha,
      @Param("noModelImpactDecisionId") String noModelImpactDecisionId,
      @Param("noModelImpactDecisionSha256") String noModelImpactDecisionSha256,
      @Param("sequence") int sequence,
      @Param("projectCatalogSha256") String projectCatalogSha256,
      @Param("payload") String payload,
      @Param("contentSha256") String contentSha256,
      @Param("proposedAt") Instant proposedAt);

  List<WorkflowRows.DeskCheckDecisionRow> findDeskCheckDecisions(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  int countDeskCheckDecisions(@Param("iterationId") String iterationId);

  int insertDeskCheckDecision(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("candidateId") String candidateId,
      @Param("candidateSha256") String candidateSha256,
      @Param("action") String action,
      @Param("reason") String reason,
      @Param("decidedByUserId") String decidedByUserId,
      @Param("decidedAt") Instant decidedAt,
      @Param("contentSha256") String contentSha256);

  WorkflowRows.ApprovedPlanRow findApprovedPlan(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  int insertApprovedPlan(
      @Param("id") String id,
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("storyId") String storyId,
      @Param("storyRevisionId") String storyRevisionId,
      @Param("taskingCandidateId") String taskingCandidateId,
      @Param("deskCheckDecisionId") String deskCheckDecisionId,
      @Param("payload") String payload,
      @Param("contentSha256") String contentSha256,
      @Param("approvedByUserId") String approvedByUserId,
      @Param("approvedAt") Instant approvedAt);
}
