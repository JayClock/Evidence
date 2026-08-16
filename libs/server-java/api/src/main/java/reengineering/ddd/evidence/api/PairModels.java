package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.api.InboxModels.IterationModel;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.domain.model.Pair;

public final class PairModels {
  private PairModels() {}

  public static final class ViewModel extends EvidenceModel<ViewModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final DeliveryModels.StoryModel story;
    @JsonProperty private final DeliveryModels.StoryRevisionModel storyRevision;
    @JsonProperty private final TaskingModels.ApprovedPlanModel approvedPlan;
    @JsonProperty private final Pair.Run run;
    @JsonProperty private final List<Pair.DriverAttempt> driverAttempts;
    @JsonProperty private final List<Pair.CommandObservation> commandObservations;
    @JsonProperty private final List<Pair.RedReview> redReviews;
    @JsonProperty private final Pair.AutomationException currentException;
    @JsonProperty private final Pair.Manifest manifest;
    @JsonProperty private final List<Pair.Decision> decisions;
    @JsonProperty private final Map<String, Object> nextAction;

    public ViewModel(String workspaceId, Pair.View view, UriInfo uriInfo) {
      String iterationId = view.iteration().getIdentity();
      iteration = new IterationModel(view.iteration(), uriInfo);
      story = new DeliveryModels.StoryModel(view.story(), uriInfo);
      storyRevision =
          new DeliveryModels.StoryRevisionModel(workspaceId, view.storyRevision(), uriInfo);
      approvedPlan = new TaskingModels.ApprovedPlanModel(workspaceId, view.approvedPlan(), uriInfo);
      run = view.run();
      driverAttempts = view.driverAttempts();
      commandObservations = view.commandObservations();
      redReviews = view.redReviews();
      currentException = view.currentException();
      manifest = view.manifest();
      decisions = view.decisions();
      nextAction = view.nextAction();
      addSelf(ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "pair"));
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "tasking"),
          "tasking");
      addRelation(
          ApiTemplates.workspaceStory(uriInfo, workspaceId, view.story().getIdentity()), "story");
      addRelation(
          ApiTemplates.workspaceStoryRevision(
              uriInfo, workspaceId, view.story().getIdentity(), view.storyRevision().getIdentity()),
          "story-revision");
      if ("running".equals(run.status())) {
        if (run.leaseExpiresAt() == null) {
          addRelation(
              ApiTemplates.workspaceIterationChild(
                  uriInfo, workspaceId, iterationId, "pair/lease/claim"),
              "claim-lease");
        } else {
          addRelation(
              ApiTemplates.workspaceIterationChild(
                  uriInfo, workspaceId, iterationId, "pair/lease/heartbeat"),
              "heartbeat-lease");
        }
        if (nextAction != null && "run_driver".equals(nextAction.get("kind"))) {
          addRelation(
              ApiTemplates.workspaceIterationChild(
                  uriInfo, workspaceId, iterationId, "pair/driver-attempts"),
              "record-driver-attempt");
        }
        if (nextAction != null && "execute_command".equals(nextAction.get("kind"))) {
          addRelation(
              ApiTemplates.workspaceIterationChild(
                  uriInfo, workspaceId, iterationId, "pair/command-observations"),
              "record-command-observation");
        }
        if (nextAction != null && "review_red".equals(nextAction.get("kind"))) {
          addRelation(
              ApiTemplates.workspaceIterationChild(
                  uriInfo, workspaceId, iterationId, "pair/red-reviews"),
              "record-red-review");
        }
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "pair/exceptions"),
            "record-exception");
      }
      if ("exception".equals(run.status()) || "approval_required".equals(run.status())) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "pair/decisions"),
            "decide");
      }
      if ("approved".equals(run.status())) {
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "showcase"),
            "showcase");
      }
    }
  }

  public static final class StartResultModel extends EvidenceModel<StartResultModel> {
    @JsonProperty private final ViewModel pair;
    @JsonProperty private final String leaseToken;

    public StartResultModel(String workspaceId, Pair.StartResult result, UriInfo uriInfo) {
      pair = new ViewModel(workspaceId, result.pair(), uriInfo);
      leaseToken = result.leaseToken();
      addSelf(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, result.pair().iteration().getIdentity(), "pair"));
    }
  }

  public static final class ActionResultModel extends EvidenceModel<ActionResultModel> {
    @JsonProperty private final ViewModel pair;
    @JsonProperty private final String acceptedRecordId;

    public ActionResultModel(String workspaceId, Pair.ActionResult result, UriInfo uriInfo) {
      pair = new ViewModel(workspaceId, result.pair(), uriInfo);
      acceptedRecordId = result.acceptedRecordId();
      addSelf(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, result.pair().iteration().getIdentity(), "pair"));
    }
  }

  public record ClaimLeaseResultModel(Pair.Run run, String leaseToken) {
    public ClaimLeaseResultModel(Pair.ClaimLeaseResult result) {
      this(result.run(), result.leaseToken());
    }
  }
}
