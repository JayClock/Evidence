package reengineering.ddd.evidence.persistent.mappers;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ExecutionMapper {
  ExecutionRows.PairRunRow findLatestPair(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  int countOpenPairs(@Param("workspaceId") String workspaceId);

  int countPairRuns(@Param("workspaceId") String workspaceId);

  int insertPairRun(@Param("row") ExecutionRows.PairRunRow row);

  int updatePairRun(
      @Param("row") ExecutionRows.PairRunRow row, @Param("expectedVersion") int expectedVersion);

  int claimPairLease(
      @Param("id") String id,
      @Param("expectedVersion") int expectedVersion,
      @Param("ownerId") String ownerId,
      @Param("tokenSha256") String tokenSha256,
      @Param("expiresAt") Instant expiresAt,
      @Param("timestamp") Instant timestamp);

  int heartbeatPairLease(
      @Param("id") String id,
      @Param("expectedVersion") int expectedVersion,
      @Param("tokenSha256") String tokenSha256,
      @Param("expiresAt") Instant expiresAt,
      @Param("timestamp") Instant timestamp);

  List<ExecutionRows.PairDriverAttemptRow> findPairDriverAttempts(
      @Param("pairRunId") String pairRunId);

  ExecutionRows.PairDriverAttemptRow findPairDriverAttemptByAction(
      @Param("pairRunId") String pairRunId, @Param("actionId") String actionId);

  int insertPairDriverAttempt(@Param("row") ExecutionRows.PairDriverAttemptRow row);

  List<ExecutionRows.PairCommandObservationRow> findPairCommandObservations(
      @Param("pairRunId") String pairRunId);

  ExecutionRows.PairCommandObservationRow findPairCommandObservationByAction(
      @Param("pairRunId") String pairRunId, @Param("actionId") String actionId);

  int insertPairCommandObservation(@Param("row") ExecutionRows.PairCommandObservationRow row);

  List<ExecutionRows.PairRedReviewRow> findPairRedReviews(@Param("pairRunId") String pairRunId);

  ExecutionRows.PairRedReviewRow findPairRedReviewByAction(
      @Param("pairRunId") String pairRunId, @Param("actionId") String actionId);

  int insertPairRedReview(@Param("row") ExecutionRows.PairRedReviewRow row);

  ExecutionRows.PairExceptionRow findCurrentPairException(@Param("pairRunId") String pairRunId);

  ExecutionRows.PairExceptionRow findPairExceptionByAction(
      @Param("pairRunId") String pairRunId, @Param("actionId") String actionId);

  int insertPairException(@Param("row") ExecutionRows.PairExceptionRow row);

  int resolvePairExceptions(
      @Param("pairRunId") String pairRunId, @Param("resolvedAt") Instant resolvedAt);

  ExecutionRows.PairManifestRow findLatestPairManifest(@Param("pairRunId") String pairRunId);

  int insertPairManifest(@Param("row") ExecutionRows.PairManifestRow row);

  List<ExecutionRows.PairDecisionRow> findPairDecisions(@Param("pairRunId") String pairRunId);

  int insertPairDecision(@Param("row") ExecutionRows.PairDecisionRow row);

  ExecutionRows.ShowcaseRunRow findLatestShowcase(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  int countShowcaseRuns(@Param("workspaceId") String workspaceId);

  int countIterationShowcases(@Param("iterationId") String iterationId);

  int insertShowcaseRun(@Param("row") ExecutionRows.ShowcaseRunRow row);

  int updateShowcaseRun(
      @Param("row") ExecutionRows.ShowcaseRunRow row,
      @Param("expectedVersion") int expectedVersion);

  List<ExecutionRows.ShowcaseQ2Row> findShowcaseQ2(@Param("runId") String runId);

  ExecutionRows.ShowcaseQ2Row findShowcaseQ2ByAction(
      @Param("runId") String runId, @Param("actionId") String actionId);

  int insertShowcaseQ2(@Param("row") ExecutionRows.ShowcaseQ2Row row);

  List<ExecutionRows.ShowcaseProductRow> findShowcaseProducts(@Param("runId") String runId);

  int insertShowcaseProduct(@Param("row") ExecutionRows.ShowcaseProductRow row);

  List<ExecutionRows.ShowcaseRiskRow> findShowcaseRisks(@Param("runId") String runId);

  int insertShowcaseRisk(@Param("row") ExecutionRows.ShowcaseRiskRow row);

  List<ExecutionRows.ShowcaseEvaluationRow> findShowcaseEvaluations(@Param("runId") String runId);

  int insertShowcaseEvaluation(@Param("row") ExecutionRows.ShowcaseEvaluationRow row);

  ExecutionRows.ShowcaseReviewRow findShowcaseReview(@Param("runId") String runId);

  int insertShowcaseReview(@Param("row") ExecutionRows.ShowcaseReviewRow row);

  ExecutionRows.ShowcaseDecisionRow findShowcaseDecision(@Param("runId") String runId);

  int insertShowcaseDecision(@Param("row") ExecutionRows.ShowcaseDecisionRow row);

  List<ExecutionRows.RespondCandidateRow> findRespondCandidates(
      @Param("workspaceId") String workspaceId, @Param("iterationId") String iterationId);

  ExecutionRows.RespondCandidateRow findRespondCandidateByAction(
      @Param("workspaceId") String workspaceId,
      @Param("iterationId") String iterationId,
      @Param("actionId") String actionId);

  int countRespondCandidates(@Param("workspaceId") String workspaceId);

  int insertRespondCandidate(@Param("row") ExecutionRows.RespondCandidateRow row);

  List<ExecutionRows.RespondDecisionRow> findRespondDecisions(
      @Param("iterationId") String iterationId);

  ExecutionRows.RespondDecisionRow findRespondDecisionByCandidate(
      @Param("candidateId") String candidateId);

  int insertRespondDecision(@Param("row") ExecutionRows.RespondDecisionRow row);
}
