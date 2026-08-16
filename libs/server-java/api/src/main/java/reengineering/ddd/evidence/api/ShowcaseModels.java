package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.api.InboxModels.IterationModel;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.domain.model.Pair;
import reengineering.ddd.evidence.domain.model.Showcase;

public final class ShowcaseModels {
  private ShowcaseModels() {}

  public static final class ViewModel extends EvidenceModel<ViewModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final DeliveryModels.StoryModel story;
    @JsonProperty private final DeliveryModels.StoryRevisionModel storyRevision;
    @JsonProperty private final TaskingModels.ApprovedPlanModel approvedPlan;
    @JsonProperty private final Pair.Run pairRun;
    @JsonProperty private final Pair.Manifest pairManifest;
    @JsonProperty private final Showcase.Run run;
    @JsonProperty private final List<Showcase.Q2Observation> q2Observations;
    @JsonProperty private final List<Showcase.ProductObservation> productObservations;
    @JsonProperty private final List<Showcase.RiskDecision> riskDecisions;
    @JsonProperty private final List<Showcase.Evaluation> evaluations;
    @JsonProperty private final Showcase.Review review;
    @JsonProperty private final Showcase.Decision decision;
    @JsonProperty private final Map<String, Object> nextAction;

    public ViewModel(String workspaceId, Showcase.View view, UriInfo uriInfo) {
      String iterationId = view.iteration().getIdentity();
      iteration = new IterationModel(view.iteration(), uriInfo);
      story = new DeliveryModels.StoryModel(view.story(), uriInfo);
      storyRevision =
          new DeliveryModels.StoryRevisionModel(workspaceId, view.storyRevision(), uriInfo);
      approvedPlan = new TaskingModels.ApprovedPlanModel(workspaceId, view.approvedPlan(), uriInfo);
      pairRun = view.pairRun();
      pairManifest = view.pairManifest();
      run = view.run();
      q2Observations = view.q2Observations();
      productObservations = view.productObservations();
      riskDecisions = view.riskDecisions();
      evaluations = view.evaluations();
      review = view.review();
      decision = view.decision();
      nextAction = view.nextAction();
      addSelf(ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "showcase"));
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "pair"), "pair");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "tasking"),
          "tasking");
      addRelation(
          ApiTemplates.workspaceStory(uriInfo, workspaceId, view.story().getIdentity()), "story");
      addRelation(
          ApiTemplates.workspaceStoryRevision(
              uriInfo, workspaceId, view.story().getIdentity(), view.storyRevision().getIdentity()),
          "story-revision");
      if ("accepted".equals(run.stage())) {
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "respond"),
            "respond");
      }
      if (nextAction == null) return;
      String kind = (String) nextAction.get("kind");
      String child =
          switch (kind) {
            case "execute_q2" -> "showcase/q2-observations";
            case "observe_scenario" -> "showcase/product-observations";
            case "decide_risk" -> "showcase/risk-decisions";
            case "evaluate_risk" -> "showcase/evaluations";
            case "run_reviewer" -> "showcase/reviews";
            case "await_human", "resolve_failure" -> "showcase/decisions";
            default -> null;
          };
      String relation =
          switch (kind) {
            case "execute_q2" -> "record-q2-observation";
            case "observe_scenario" -> "record-product-observation";
            case "decide_risk" -> "record-risk-decision";
            case "evaluate_risk" -> "record-evaluation";
            case "run_reviewer" -> "record-review";
            case "await_human", "resolve_failure" -> "decide";
            default -> null;
          };
      if (child != null) {
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, child),
            relation);
      }
    }
  }

  public static final class ActionResultModel extends EvidenceModel<ActionResultModel> {
    @JsonProperty private final ViewModel showcase;
    @JsonProperty private final String acceptedRecordId;

    public ActionResultModel(String workspaceId, Showcase.ActionResult result, UriInfo uriInfo) {
      showcase = new ViewModel(workspaceId, result.showcase(), uriInfo);
      acceptedRecordId = result.acceptedRecordId();
      addSelf(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, result.showcase().iteration().getIdentity(), "showcase"));
    }
  }
}
