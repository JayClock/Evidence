package reengineering.ddd.evidence.persistent.associations;

import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import jakarta.inject.Inject;
import java.util.Optional;
import reengineering.ddd.evidence.domain.model.Pair;
import reengineering.ddd.evidence.domain.model.Respond;
import reengineering.ddd.evidence.domain.model.Showcase;
import reengineering.ddd.evidence.domain.model.Workspace;

@AssociationMapping(entity = Workspace.class, field = "execution", parentIdField = "workspaceId")
public final class WorkspaceExecution implements Workspace.ExecutionAssociation {
  private String workspaceId;
  @Inject private PairStore pair;
  @Inject private ShowcaseStore showcase;
  @Inject private RespondStore respond;

  @Override
  public Optional<Pair.View> findPair(String iterationId) {
    return Optional.ofNullable(pair.find(workspaceId, iterationId));
  }

  @Override
  public Pair.StartResult startPair(String iterationId, Pair.StartInput input) {
    return pair.start(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ClaimLeaseResult claimPairLease(String iterationId, Pair.ClaimLeaseInput input) {
    return pair.claimLease(workspaceId, iterationId, input);
  }

  @Override
  public Pair.Run heartbeatPairLease(String iterationId, Pair.HeartbeatLeaseInput input) {
    return pair.heartbeat(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult recordPairDriverAttempt(
      String iterationId, Pair.DriverAttemptInput input) {
    return pair.recordDriver(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult recordPairCommandObservation(
      String iterationId, Pair.CommandObservationInput input) {
    return pair.recordCommand(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult recordPairRedReview(String iterationId, Pair.RedReviewInput input) {
    return pair.recordRedReview(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult recordPairException(String iterationId, Pair.ExceptionInput input) {
    return pair.recordException(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult decidePair(
      String iterationId, Pair.DecideInput input, String decidedByUserId) {
    return pair.decide(workspaceId, iterationId, input, decidedByUserId);
  }

  @Override
  public Optional<Showcase.View> findShowcase(String iterationId) {
    return Optional.ofNullable(showcase.find(workspaceId, iterationId));
  }

  @Override
  public Showcase.ActionResult recordQ2Observation(
      String iterationId, Showcase.Q2ObservationInput input) {
    return showcase.recordQ2(workspaceId, iterationId, input);
  }

  @Override
  public Showcase.ActionResult recordProductObservation(
      String iterationId, Showcase.ProductObservationInput input, String observedByUserId) {
    return showcase.recordProduct(workspaceId, iterationId, input, observedByUserId);
  }

  @Override
  public Showcase.ActionResult recordRiskDecision(
      String iterationId, Showcase.RiskDecisionInput input, String decidedByUserId) {
    return showcase.recordRisk(workspaceId, iterationId, input, decidedByUserId);
  }

  @Override
  public Showcase.ActionResult recordEvaluation(
      String iterationId, Showcase.EvaluationInput input, String observedByUserId) {
    return showcase.recordEvaluation(workspaceId, iterationId, input, observedByUserId);
  }

  @Override
  public Showcase.ActionResult recordReview(String iterationId, Showcase.ReviewInput input) {
    return showcase.recordReview(workspaceId, iterationId, input);
  }

  @Override
  public Showcase.ActionResult decideShowcase(
      String iterationId, Showcase.DecideInput input, String decidedByUserId) {
    return showcase.decide(workspaceId, iterationId, input, decidedByUserId);
  }

  @Override
  public Optional<Respond.View> findRespond(String iterationId) {
    return Optional.ofNullable(respond.find(workspaceId, iterationId));
  }

  @Override
  public Respond.ActionResult proposeRespondCandidate(
      String iterationId, Respond.ProposeInput input) {
    return respond.propose(workspaceId, iterationId, input);
  }

  @Override
  public Respond.ActionResult decideRespond(
      String iterationId, Respond.DecideInput input, String decidedByUserId) {
    return respond.decide(workspaceId, iterationId, input, decidedByUserId);
  }
}
