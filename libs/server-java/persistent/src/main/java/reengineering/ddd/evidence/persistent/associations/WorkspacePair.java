package reengineering.ddd.evidence.persistent.associations;

import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import jakarta.inject.Inject;
import java.util.Optional;
import reengineering.ddd.evidence.domain.model.Pair;
import reengineering.ddd.evidence.domain.model.Workspace;

@AssociationMapping(entity = Workspace.class, field = "pair", parentIdField = "workspaceId")
public final class WorkspacePair implements Workspace.PairAssociation {
  private String workspaceId;
  @Inject private PairStore store;

  @Override
  public Optional<Pair.View> findPair(String iterationId) {
    return Optional.ofNullable(store.find(workspaceId, iterationId));
  }

  @Override
  public Pair.StartResult startPair(String iterationId, Pair.StartInput input) {
    return store.start(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ClaimLeaseResult claimPairLease(String iterationId, Pair.ClaimLeaseInput input) {
    return store.claimLease(workspaceId, iterationId, input);
  }

  @Override
  public Pair.Run heartbeatPairLease(String iterationId, Pair.HeartbeatLeaseInput input) {
    return store.heartbeat(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult recordPairDriverAttempt(
      String iterationId, Pair.DriverAttemptInput input) {
    return store.recordDriver(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult recordPairCommandObservation(
      String iterationId, Pair.CommandObservationInput input) {
    return store.recordCommand(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult recordPairRedReview(String iterationId, Pair.RedReviewInput input) {
    return store.recordRedReview(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult recordPairException(String iterationId, Pair.ExceptionInput input) {
    return store.recordException(workspaceId, iterationId, input);
  }

  @Override
  public Pair.ActionResult decidePair(
      String iterationId, Pair.DecideInput input, String decidedByUserId) {
    return store.decide(workspaceId, iterationId, input, decidedByUserId);
  }
}
