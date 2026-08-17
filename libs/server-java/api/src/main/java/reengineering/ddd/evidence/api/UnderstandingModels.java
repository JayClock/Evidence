package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.InboxModels.IterationModel;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.description.ClarificationDescription;
import reengineering.ddd.evidence.domain.description.ScenarioDraftDescription;
import reengineering.ddd.evidence.domain.description.ScenarioProposalDescription;
import reengineering.ddd.evidence.domain.description.UnderstandingDecisionDescription;
import reengineering.ddd.evidence.domain.model.Clarification;
import reengineering.ddd.evidence.domain.model.ScenarioDraft;
import reengineering.ddd.evidence.domain.model.ScenarioProposal;
import reengineering.ddd.evidence.domain.model.Understanding;
import reengineering.ddd.evidence.domain.model.UnderstandingDecision;

public final class UnderstandingModels {
  private UnderstandingModels() {}

  public static final class ClarificationModel {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final String storyId;
    @JsonProperty private final String storyRevisionId;
    @JsonProperty private final String target;
    @JsonProperty private final String question;
    @JsonProperty private final String status;
    @JsonProperty private final String askedAt;
    @JsonProperty private final String answer;
    @JsonProperty private final String answeredByUserId;
    @JsonProperty private final String answeredAt;
    @JsonProperty private final String waivedReason;
    @JsonProperty private final String waivedByUserId;
    @JsonProperty private final String waivedAt;
    @JsonProperty private final String contentSha256;

    public ClarificationModel(Clarification clarification) {
      ClarificationDescription value = clarification.getDescription();
      id = clarification.getIdentity();
      reference = value.reference();
      storyId = value.story().id();
      storyRevisionId = value.storyRevision().id();
      target = value.target().wireValue();
      question = value.question();
      status = value.status().wireValue();
      askedAt = CanonicalJson.instant(value.askedAt());
      answer = value.answer();
      answeredByUserId = value.answeredBy() == null ? null : value.answeredBy().id();
      answeredAt = value.answeredAt() == null ? null : CanonicalJson.instant(value.answeredAt());
      waivedReason = value.waivedReason();
      waivedByUserId = value.waivedBy() == null ? null : value.waivedBy().id();
      waivedAt = value.waivedAt() == null ? null : CanonicalJson.instant(value.waivedAt());
      contentSha256 = value.contentSha256();
    }
  }

  public static final class ScenarioDraftModel {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final int position;
    @JsonProperty private final String title;
    @JsonProperty private final List<String> given;
    @JsonProperty private final String when;
    @JsonProperty private final List<String> then;
    @JsonProperty private final List<String> businessData;
    @JsonProperty private final String contentSha256;

    private ScenarioDraftModel(ScenarioDraft draft) {
      ScenarioDraftDescription value = draft.getDescription();
      id = draft.getIdentity();
      reference = value.reference();
      position = value.position();
      title = value.title();
      given = value.given();
      when = value.when();
      then = value.then();
      businessData = value.businessData();
      contentSha256 = value.contentSha256();
    }
  }

  public static final class ScenarioProposalModel {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final String storyId;
    @JsonProperty private final String storyRevisionId;
    @JsonProperty private final int sequence;
    @JsonProperty private final List<ScenarioDraftModel> drafts;
    @JsonProperty private final String proposedAt;
    @JsonProperty private final String contentSha256;

    public ScenarioProposalModel(ScenarioProposal proposal) {
      ScenarioProposalDescription value = proposal.getDescription();
      id = proposal.getIdentity();
      reference = value.reference();
      storyId = value.story().id();
      storyRevisionId = value.storyRevision().id();
      sequence = value.sequence();
      drafts = value.drafts().stream().map(ScenarioDraftModel::new).toList();
      proposedAt = CanonicalJson.instant(value.proposedAt());
      contentSha256 = value.contentSha256();
    }
  }

  public static final class DecisionModel {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final String proposalId;
    @JsonProperty private final String action;
    @JsonProperty private final String reason;
    @JsonProperty private final List<String> selectedDraftIds;
    @JsonProperty private final List<String> confirmedScenarioIds;
    @JsonProperty private final String decidedByUserId;
    @JsonProperty private final String decidedAt;
    @JsonProperty private final String contentSha256;

    private DecisionModel(UnderstandingDecision decision) {
      UnderstandingDecisionDescription value = decision.getDescription();
      id = decision.getIdentity();
      reference = value.reference();
      proposalId = value.proposal() == null ? null : value.proposal().id();
      action = value.action().wireValue();
      reason = value.reason();
      selectedDraftIds =
          value.selectedDrafts().stream().map(io.github.jayclock.smartdomain.core.Ref::id).toList();
      confirmedScenarioIds =
          value.confirmedScenarios().stream()
              .map(io.github.jayclock.smartdomain.core.Ref::id)
              .toList();
      decidedByUserId = value.decidedBy().id();
      decidedAt = CanonicalJson.instant(value.decidedAt());
      contentSha256 = value.contentSha256();
    }
  }

  public static final class UnderstandingModel extends EvidenceModel<UnderstandingModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final DeliveryModels.StoryModel story;
    @JsonProperty private final DeliveryModels.StoryRevisionModel storyRevision;
    @JsonProperty private final ClarificationModel pendingClarification;
    @JsonProperty private final List<ClarificationModel> clarifications;
    @JsonProperty private final ScenarioProposalModel currentScenarioProposal;
    @JsonProperty private final List<DecisionModel> decisions;

    public UnderstandingModel(String workspaceId, Understanding.View view, UriInfo uriInfo) {
      String iterationId = view.iteration().getIdentity();
      iteration = new IterationModel(view.iteration(), uriInfo);
      story = new DeliveryModels.StoryModel(view.story(), uriInfo);
      storyRevision =
          new DeliveryModels.StoryRevisionModel(workspaceId, view.storyRevision(), uriInfo);
      pendingClarification =
          view.pendingClarification() == null
              ? null
              : new ClarificationModel(view.pendingClarification());
      clarifications = view.clarifications().stream().map(ClarificationModel::new).toList();
      currentScenarioProposal =
          view.currentScenarioProposal() == null
              ? null
              : new ScenarioProposalModel(view.currentScenarioProposal());
      decisions = view.decisions().stream().map(DecisionModel::new).toList();
      addSelf(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "understanding"));
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceStory(uriInfo, workspaceId, view.story().getIdentity()), "story");
      String lifecycle = view.iteration().getDescription().lifecycle();
      String loop = view.iteration().getDescription().loop();
      String stage = view.iteration().getDescription().stage();
      if ("active".equals(lifecycle) && "understand".equals(loop) && "tqa".equals(stage)) {
        if (view.pendingClarification() == null) {
          addRelation(
              ApiTemplates.workspaceIterationChild(
                  uriInfo, workspaceId, iterationId, "understanding/clarifications"),
              "ask-question");
          addRelation(
              ApiTemplates.workspaceIterationChild(
                  uriInfo, workspaceId, iterationId, "understanding/scenario-proposals"),
              "propose-scenarios");
        } else {
          addRelation(
              ApiTemplates.workspaceIterationChild(
                  uriInfo,
                  workspaceId,
                  iterationId,
                  "understanding/clarifications/"
                      + view.pendingClarification().getIdentity()
                      + "/answer"),
              "answer-question");
        }
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "understanding/decisions"),
            "decide");
      }
      if ("active".equals(lifecycle)
          && "understand".equals(loop)
          && "scenario_review".equals(stage)) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "understanding/decisions"),
            "decide");
      }
      if ("active".equals(lifecycle) && "understand".equals(loop) && "modeling".equals(stage)) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "tasking/no-model-impact"),
            "record-no-model-impact");
      }
    }
  }

  public static final class AnswerResultModel extends EvidenceModel<AnswerResultModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final ClarificationModel clarification;

    public AnswerResultModel(
        String workspaceId, Understanding.AnswerResult result, UriInfo uriInfo) {
      String iterationId = result.iteration().getIdentity();
      iteration = new IterationModel(result.iteration(), uriInfo);
      clarification = new ClarificationModel(result.clarification());
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "understanding"),
          "understanding");
    }
  }

  public static final class DecisionResultModel extends EvidenceModel<DecisionResultModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final DecisionModel decision;
    @JsonProperty private final DeliveryModels.StoryRevisionModel storyRevision;

    public DecisionResultModel(
        String workspaceId, Understanding.DecisionResult result, UriInfo uriInfo) {
      String iterationId = result.iteration().getIdentity();
      iteration = new IterationModel(result.iteration(), uriInfo);
      decision = new DecisionModel(result.decision());
      storyRevision =
          result.storyRevision() == null
              ? null
              : new DeliveryModels.StoryRevisionModel(workspaceId, result.storyRevision(), uriInfo);
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "understanding"),
          "understanding");
      if (result.storyRevision() != null) {
        addRelation(
            ApiTemplates.workspaceStoryRevision(
                uriInfo,
                workspaceId,
                result.storyRevision().getDescription().story().id(),
                result.storyRevision().getIdentity()),
            "story-revision");
      }
    }
  }
}
