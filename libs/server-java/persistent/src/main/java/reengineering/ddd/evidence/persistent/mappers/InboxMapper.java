package reengineering.ddd.evidence.persistent.mappers;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.evidence.domain.model.Inbox;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;

@Mapper
public interface InboxMapper {
  List<InboxRows.ItemRow> findItems(
      @Param("workspaceId") String workspaceId,
      @Param("status") String status,
      @Param("sourceKind") String sourceKind,
      @Param("query") String query,
      @Param("from") int from,
      @Param("size") int size);

  int countItems(
      @Param("workspaceId") String workspaceId,
      @Param("status") String status,
      @Param("sourceKind") String sourceKind,
      @Param("query") String query);

  InboxRows.ItemRow findItem(
      @Param("workspaceId") String workspaceId, @Param("itemId") String itemId);

  InboxRows.ItemRow findSourceItem(
      @Param("workspaceId") String workspaceId,
      @Param("sourceKind") String sourceKind,
      @Param("externalKey") String externalKey);

  InboxRows.ItemRow lockItem(
      @Param("workspaceId") String workspaceId, @Param("itemId") String itemId);

  void lockSource(
      @Param("workspaceId") String workspaceId,
      @Param("sourceKind") String sourceKind,
      @Param("externalKey") String externalKey);

  int insertItem(
      @Param("id") String id,
      @Param("workspaceId") String workspaceId,
      @Param("source") Inbox.Source source,
      @Param("timestamp") Instant timestamp);

  int setInitialLatestRevision(
      @Param("workspaceId") String workspaceId,
      @Param("itemId") String itemId,
      @Param("revisionId") String revisionId);

  int updateLatestRevision(
      @Param("workspaceId") String workspaceId,
      @Param("itemId") String itemId,
      @Param("expectedVersion") int expectedVersion,
      @Param("title") String title,
      @Param("revisionId") String revisionId,
      @Param("timestamp") Instant timestamp);

  int updateItemStatus(
      @Param("workspaceId") String workspaceId,
      @Param("itemId") String itemId,
      @Param("expectedVersion") int expectedVersion,
      @Param("status") String status,
      @Param("timestamp") Instant timestamp);

  int insertRevision(
      @Param("id") String id,
      @Param("itemId") String itemId,
      @Param("revisionNumber") int revisionNumber,
      @Param("source") Inbox.Source source,
      @Param("providerMetadata") String providerMetadata,
      @Param("contentSha256") String contentSha256,
      @Param("capturedAt") Instant capturedAt);

  InboxRows.RevisionRow findRevision(
      @Param("workspaceId") String workspaceId,
      @Param("itemId") String itemId,
      @Param("revisionId") String revisionId);

  InboxRows.RevisionRow findRevisionByHash(
      @Param("itemId") String itemId, @Param("contentSha256") String contentSha256);

  List<InboxRows.RevisionRow> findRevisions(
      @Param("itemId") String itemId, @Param("from") int from, @Param("size") int size);

  int countRevisions(@Param("itemId") String itemId);

  List<InboxRows.ItemRow> findSelectedItems(
      @Param("workspaceId") String workspaceId, @Param("itemIds") List<String> itemIds);

  int insertExtraction(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("requestedByUserId") String requestedByUserId,
      @Param("requestedAt") Instant requestedAt);

  int insertExtractionSource(
      @Param("id") String id,
      @Param("extractionId") String extractionId,
      @Param("item") InboxRows.ItemRow item,
      @Param("revision") InboxRows.RevisionRow revision,
      @Param("position") int position);

  InboxRows.ExtractionRow findExtraction(
      @Param("workspaceId") String workspaceId, @Param("extractionId") String extractionId);

  InboxRows.ExtractionRow lockExtraction(
      @Param("workspaceId") String workspaceId, @Param("extractionId") String extractionId);

  List<InboxRows.ExtractionSourceRow> findExtractionSources(
      @Param("extractionId") String extractionId);

  int completeExtraction(
      @Param("workspaceId") String workspaceId,
      @Param("extractionId") String extractionId,
      @Param("expectedVersion") int expectedVersion,
      @Param("completedAt") Instant completedAt);

  int insertCandidate(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("extractionId") String extractionId,
      @Param("candidate") InboxWorkflow.CandidateData candidate,
      @Param("contentSha256") String contentSha256,
      @Param("proposedAt") Instant proposedAt);

  int insertCitation(
      @Param("id") String id,
      @Param("candidateId") String candidateId,
      @Param("source") InboxRows.ExtractionSourceRow source,
      @Param("position") int position,
      @Param("locator") String locator,
      @Param("revisionSha256") String revisionSha256);

  List<InboxRows.CandidateRow> findCandidates(
      @Param("workspaceId") String workspaceId,
      @Param("extractionId") String extractionId,
      @Param("query") String query);

  InboxRows.CandidateRow findCandidate(
      @Param("workspaceId") String workspaceId, @Param("candidateId") String candidateId);

  String lockCandidate(
      @Param("workspaceId") String workspaceId, @Param("candidateId") String candidateId);

  List<InboxRows.CitationRow> findCitations(@Param("candidateId") String candidateId);

  InboxRows.DecisionRow findDecision(@Param("candidateId") String candidateId);

  int insertDecision(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("candidateId") String candidateId,
      @Param("candidateSha256") String candidateSha256,
      @Param("action") String action,
      @Param("reason") String reason,
      @Param("decidedByUserId") String decidedByUserId,
      @Param("decidedAt") Instant decidedAt,
      @Param("contentSha256") String contentSha256);

  int countDiscoveryWip(@Param("workspaceId") String workspaceId);

  int insertIteration(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("workspaceId") String workspaceId,
      @Param("candidate") InboxRows.CandidateRow candidate,
      @Param("baseCommitSha") String baseCommitSha,
      @Param("selectedByUserId") String selectedByUserId,
      @Param("admittedAt") Instant admittedAt);

  int insertIterationIntake(
      @Param("iterationId") String iterationId,
      @Param("candidateSnapshot") String candidateSnapshot,
      @Param("sourceSnapshots") String sourceSnapshots,
      @Param("requirementsProjection") String requirementsProjection,
      @Param("contentSha256") String contentSha256,
      @Param("frozenAt") Instant frozenAt);

  int insertKickoffProposal(
      @Param("id") String id,
      @Param("reference") String reference,
      @Param("iterationId") String iterationId,
      @Param("candidate") InboxWorkflow.CandidateData candidate,
      @Param("citations") String citations,
      @Param("contentSha256") String contentSha256,
      @Param("proposedAt") Instant proposedAt);

  InboxRows.IterationRow findIteration(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  int allocateExtractionNumber(
      @Param("workspaceId") String workspaceId, @Param("timestamp") Instant timestamp);

  int allocateCandidateNumber(
      @Param("workspaceId") String workspaceId, @Param("timestamp") Instant timestamp);

  int allocateDecisionNumber(
      @Param("workspaceId") String workspaceId, @Param("timestamp") Instant timestamp);

  int allocateIterationNumber(
      @Param("workspaceId") String workspaceId, @Param("timestamp") Instant timestamp);

  int allocateKickoffNumber(
      @Param("workspaceId") String workspaceId, @Param("timestamp") Instant timestamp);
}
