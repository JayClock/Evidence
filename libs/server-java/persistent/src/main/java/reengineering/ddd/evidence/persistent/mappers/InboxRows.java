package reengineering.ddd.evidence.persistent.mappers;

import java.time.Instant;

public final class InboxRows {
  private InboxRows() {}

  public record ItemRow(
      String id,
      String workspaceId,
      String sourceKind,
      String externalKey,
      String title,
      String status,
      String latestRevisionId,
      String latestRevisionSha256,
      int revisionCount,
      int version,
      Instant createdAt,
      Instant updatedAt) {}

  public record RevisionRow(
      String id,
      String inboxItemId,
      int revisionNumber,
      String title,
      String body,
      String contentType,
      String uri,
      String providerMetadata,
      Instant sourceUpdatedAt,
      Instant capturedAt,
      String contentSha256) {}

  public record ExtractionRow(
      String id,
      String reference,
      String workspaceId,
      String status,
      int version,
      String requestedByUserId,
      Instant requestedAt,
      Instant completedAt,
      String failureSummary) {}

  public record ExtractionSourceRow(
      String id,
      String extractionId,
      String inboxItemId,
      String inboxRevisionId,
      int position,
      int revisionNumber,
      String sourceKind,
      String externalKey,
      String itemStatus,
      String title,
      String body,
      String contentType,
      String uri,
      String providerMetadata,
      Instant sourceUpdatedAt,
      Instant capturedAt,
      String contentSha256) {}

  public record CandidateRow(
      String id,
      String reference,
      String workspaceId,
      String extractionId,
      String title,
      String problem,
      String role,
      String goal,
      String value,
      String cognitiveMode,
      String contentSha256,
      Instant proposedAt,
      String decisionId,
      String decisionAction,
      String selectedIterationId,
      boolean stale) {}

  public record CitationRow(
      String id,
      String candidateId,
      String inboxItemId,
      String inboxRevisionId,
      int position,
      int revisionNumber,
      String revisionSha256,
      String locator) {}

  public record DecisionRow(
      String id,
      String reference,
      String workspaceId,
      String candidateId,
      String candidateSha256,
      String action,
      String reason,
      String decidedByUserId,
      Instant decidedAt,
      String contentSha256) {}

  public record IterationRow(
      String id,
      String reference,
      String workspaceId,
      String sourceCandidateId,
      String sourceCandidateSha256,
      String lifecycle,
      String loop,
      String stage,
      String lane,
      int version,
      String baseCommitSha,
      String branchName,
      String provisioningFailureSummary,
      String activeStoryId,
      String admittedByUserId,
      Instant admittedAt,
      Instant updatedAt) {}
}
