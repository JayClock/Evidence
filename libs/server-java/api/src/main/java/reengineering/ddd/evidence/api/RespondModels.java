package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.api.InboxModels.IterationModel;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.domain.model.Respond;
import reengineering.ddd.evidence.domain.model.Showcase;

public final class RespondModels {
  private RespondModels() {}

  public static final class ViewModel extends EvidenceModel<ViewModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final DeliveryModels.StoryModel story;
    @JsonProperty private final DeliveryModels.StoryRevisionModel storyRevision;
    @JsonProperty private final Showcase.Run showcaseRun;
    @JsonProperty private final Showcase.Decision showcaseDecision;
    @JsonProperty private final Respond.Authority authority;
    @JsonProperty private final List<Respond.Candidate> candidates;
    @JsonProperty private final List<Respond.Decision> decisions;
    @JsonProperty private final Map<String, Object> nextAction;

    public ViewModel(String workspaceId, Respond.View view, UriInfo uriInfo) {
      String iterationId = view.iteration().getIdentity();
      iteration = new IterationModel(view.iteration(), uriInfo);
      story = new DeliveryModels.StoryModel(view.story(), uriInfo);
      storyRevision =
          new DeliveryModels.StoryRevisionModel(workspaceId, view.storyRevision(), uriInfo);
      showcaseRun = view.showcaseRun();
      showcaseDecision = view.showcaseDecision();
      authority = view.authority();
      candidates = view.candidates();
      decisions = view.decisions();
      nextAction = view.nextAction();
      addSelf(ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "respond"));
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "showcase"),
          "showcase");
      addRelation(
          ApiTemplates.workspaceStory(uriInfo, workspaceId, view.story().getIdentity()), "story");
      addRelation(
          ApiTemplates.workspaceStoryRevision(
              uriInfo, workspaceId, view.story().getIdentity(), view.storyRevision().getIdentity()),
          "story-revision");
      if (nextAction != null && "run_learner".equals(nextAction.get("kind"))) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "respond/candidates"),
            "propose-candidate");
      }
      if (nextAction != null && "await_human".equals(nextAction.get("kind"))) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "respond/decisions"),
            "decide");
      }
    }
  }

  public static final class ActionResultModel extends EvidenceModel<ActionResultModel> {
    @JsonProperty private final ViewModel respond;
    @JsonProperty private final String acceptedRecordId;

    public ActionResultModel(String workspaceId, Respond.ActionResult result, UriInfo uriInfo) {
      respond = new ViewModel(workspaceId, result.respond(), uriInfo);
      acceptedRecordId = result.acceptedRecordId();
      addSelf(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, result.respond().iteration().getIdentity(), "respond"));
    }
  }
}
