package reengineering.ddd.evidence.persistent.mappers;

import java.time.Instant;

public final class WorkflowRows {
  private WorkflowRows() {}

  public record IntakeRow(
      String iterationId,
      String candidateSnapshot,
      String sourceSnapshots,
      String requirementsProjection,
      String contentSha256,
      Instant frozenAt) {}

  public record KickoffProposalRow(
      String id,
      String reference,
      String iterationId,
      int sequence,
      String origin,
      String title,
      String problem,
      String role,
      String goal,
      String value,
      String cognitiveMode,
      String citations,
      String contentSha256,
      Instant proposedAt,
      String decisionId) {}

  public record KickoffDecisionRow(
      String id,
      String reference,
      String iterationId,
      String proposalId,
      String proposalSha256,
      String action,
      String reason,
      String decidedByUserId,
      Instant decidedAt,
      String contentSha256) {}

  public record ProblemStatementRow(
      String id,
      String storyId,
      String iterationId,
      int revisionNumber,
      String title,
      String problem,
      String cognitiveMode,
      String citations,
      String contentSha256,
      Instant createdAt) {}

  public record StoryCardRow(
      String id,
      String storyId,
      String iterationId,
      String problemStatementId,
      int revisionNumber,
      String title,
      String role,
      String goal,
      String value,
      String contentSha256,
      Instant createdAt) {}

  public record StoryRow(
      String id,
      String workspaceId,
      String iterationId,
      String iterationReference,
      String iterationLifecycle,
      String iterationLoop,
      String iterationStage,
      String latestRevisionId,
      String title,
      String goal,
      int latestRevisionNumber,
      int latestScenarioCount,
      int latestCitationCount,
      String pendingClarificationReference,
      int revisionCount,
      int version,
      Instant createdAt,
      Instant updatedAt) {}

  public record StoryRevisionRow(
      String id,
      String storyId,
      int revisionNumber,
      String title,
      String problem,
      String role,
      String goal,
      String value,
      String cognitiveMode,
      String contentSha256,
      String createdByUserId,
      Instant createdAt) {}

  public record StoryCitationRow(
      String id,
      String storyRevisionId,
      String inboxItemId,
      String inboxRevisionId,
      int inboxRevisionNumber,
      int position,
      String contentSha256,
      String locator) {}

  public record StoryScenarioRow(
      String id,
      String reference,
      String storyRevisionId,
      String sourceDraftId,
      String understandingDecisionId,
      int position,
      String title,
      String givenSteps,
      String whenStep,
      String thenSteps,
      String businessData,
      Instant confirmedAt) {}

  public record ClarificationRow(
      String id,
      String reference,
      String workspaceId,
      String iterationId,
      String storyId,
      String storyRevisionId,
      int sequence,
      String target,
      String question,
      String status,
      Instant askedAt,
      String answer,
      String answeredByUserId,
      Instant answeredAt,
      String waivedReason,
      String waivedByUserId,
      Instant waivedAt,
      String contentSha256) {}

  public record ScenarioProposalRow(
      String id,
      String reference,
      String workspaceId,
      String iterationId,
      String storyId,
      String storyRevisionId,
      int sequence,
      String contentSha256,
      Instant proposedAt,
      String decisionId) {}

  public record ScenarioDraftRow(
      String id,
      String reference,
      String proposalId,
      int position,
      String title,
      String givenSteps,
      String whenStep,
      String thenSteps,
      String businessData,
      String contentSha256) {}

  public record UnderstandingDecisionRow(
      String id,
      String reference,
      String workspaceId,
      String iterationId,
      String storyId,
      String storyRevisionId,
      String proposalId,
      String proposalSha256,
      String action,
      String reason,
      String selectedDraftIds,
      String confirmedScenarioIds,
      String decidedByUserId,
      Instant decidedAt,
      String contentSha256) {}

  public record NoModelImpactRow(
      String id,
      String reference,
      String workspaceId,
      String iterationId,
      String storyId,
      String storyRevisionId,
      String storyRevisionSha256,
      String reason,
      String decidedByUserId,
      Instant decidedAt,
      String contentSha256) {}

  public record TaskingCandidateRow(
      String id,
      String reference,
      String workspaceId,
      String iterationId,
      String storyId,
      String storyRevisionId,
      String storyRevisionSha256,
      String baseCommitSha,
      String noModelImpactDecisionId,
      String noModelImpactDecisionSha256,
      int sequence,
      String projectCatalogSha256,
      String payload,
      String contentSha256,
      Instant proposedAt,
      String decisionId) {}

  public record DeskCheckDecisionRow(
      String id,
      String reference,
      String workspaceId,
      String iterationId,
      String candidateId,
      String candidateSha256,
      String action,
      String reason,
      String decidedByUserId,
      Instant decidedAt,
      String contentSha256) {}

  public record ApprovedPlanRow(
      String id,
      String workspaceId,
      String iterationId,
      String storyId,
      String storyRevisionId,
      String taskingCandidateId,
      String deskCheckDecisionId,
      String payload,
      String contentSha256,
      String approvedByUserId,
      Instant approvedAt) {}
}
