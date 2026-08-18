package reengineering.ddd.evidence.persistent.associations;

import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import jakarta.inject.Inject;
import java.util.Optional;
import reengineering.ddd.evidence.domain.model.Showcase;
import reengineering.ddd.evidence.domain.model.Workspace;

@AssociationMapping(entity = Workspace.class, field = "showcase", parentIdField = "workspaceId")
public final class WorkspaceShowcase implements Workspace.ShowcaseAssociation {
  private String workspaceId;
  @Inject private ShowcaseStore store;

  @Override
  public Optional<Showcase.View> findShowcase(String iterationId) {
    return Optional.ofNullable(store.find(workspaceId, iterationId));
  }

  @Override
  public Showcase.ActionResult recordQ2Observation(
      String iterationId, Showcase.Q2ObservationInput input) {
    return store.recordQ2(workspaceId, iterationId, input);
  }

  @Override
  public Showcase.ActionResult recordProductObservation(
      String iterationId, Showcase.ProductObservationInput input, String observedByUserId) {
    return store.recordProduct(workspaceId, iterationId, input, observedByUserId);
  }

  @Override
  public Showcase.ActionResult recordRiskDecision(
      String iterationId, Showcase.RiskDecisionInput input, String decidedByUserId) {
    return store.recordRisk(workspaceId, iterationId, input, decidedByUserId);
  }

  @Override
  public Showcase.ActionResult recordEvaluation(
      String iterationId, Showcase.EvaluationInput input, String observedByUserId) {
    return store.recordEvaluation(workspaceId, iterationId, input, observedByUserId);
  }

  @Override
  public Showcase.ActionResult recordReview(String iterationId, Showcase.ReviewInput input) {
    return store.recordReview(workspaceId, iterationId, input);
  }

  @Override
  public Showcase.ActionResult decideShowcase(
      String iterationId, Showcase.DecideInput input, String decidedByUserId) {
    return store.decide(workspaceId, iterationId, input, decidedByUserId);
  }
}
