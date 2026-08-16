package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.InboxModels.IterationModel;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.model.Tasking;
import reengineering.ddd.evidence.domain.model.TaskingCatalog;

public final class TaskingModels {
  private TaskingModels() {}

  public static final class NoModelImpactModel extends EvidenceModel<NoModelImpactModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final String storyId;
    @JsonProperty private final String storyRevisionId;
    @JsonProperty private final String storyRevisionSha256;
    @JsonProperty private final String subject = "tool";
    @JsonProperty private final String method = "none";
    @JsonProperty private final boolean modelChangeRequired = false;
    @JsonProperty private final String reason;
    @JsonProperty private final String decidedByUserId;
    @JsonProperty private final String decidedAt;
    @JsonProperty private final String contentSha256;

    public NoModelImpactModel(String workspaceId, Tasking.NoModelImpact decision, UriInfo uriInfo) {
      Tasking.NoModelImpactDescription value = decision.getDescription();
      String iterationId = value.iteration().id();
      id = decision.getIdentity();
      reference = value.reference();
      storyId = value.story().id();
      storyRevisionId = value.storyRevision().id();
      storyRevisionSha256 = value.storyRevisionSha256();
      reason = value.reason();
      decidedByUserId = value.decidedBy().id();
      decidedAt = CanonicalJson.instant(value.decidedAt());
      contentSha256 = value.contentSha256();
      addSelf(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, iterationId, "tasking/no-model-impact/" + id));
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "tasking"),
          "tasking");
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(ApiTemplates.workspaceStory(uriInfo, workspaceId, storyId), "story");
      addRelation(
          ApiTemplates.workspaceStoryRevision(uriInfo, workspaceId, storyId, storyRevisionId),
          "story-revision");
    }
  }

  public static class TaskingSnapshot {
    @JsonProperty private final int planVersion;
    @JsonProperty private final String reference;
    @JsonProperty private final String storyId;
    @JsonProperty private final String storyRevisionId;
    @JsonProperty private final String storyRevisionSha256;
    @JsonProperty private final String baseCommitSha;
    @JsonProperty private final String noModelImpactDecisionId;
    @JsonProperty private final String noModelImpactDecisionSha256;
    @JsonProperty private final int sequence;
    @JsonProperty private final Tasking.ProjectCatalog projectCatalog;
    @JsonProperty private final String projectCatalogSha256;
    @JsonProperty private final List<Tasking.TestDescription> tests;
    @JsonProperty private final List<Tasking.TaskDescription> tasks;
    @JsonProperty private final List<Tasking.ProcessSelection> processes;
    @JsonProperty private final Tasking.ExecutionBudget executionBudget;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String proposedBy = "tasking-analyst";
    @JsonProperty private final String proposedAt;

    protected TaskingSnapshot(Tasking.CandidateDescription value) {
      planVersion = value.planVersion();
      reference = value.reference();
      storyId = value.story().id();
      storyRevisionId = value.storyRevision().id();
      storyRevisionSha256 = value.storyRevisionSha256();
      baseCommitSha = value.baseCommitSha();
      noModelImpactDecisionId = value.noModelImpactDecision().id();
      noModelImpactDecisionSha256 = value.noModelImpactDecisionSha256();
      sequence = value.sequence();
      projectCatalog = value.projectCatalog();
      projectCatalogSha256 = value.projectCatalogSha256();
      tests = value.tests();
      tasks = value.tasks();
      processes = value.processes();
      executionBudget = value.executionBudget();
      contentSha256 = value.contentSha256();
      proposedAt = CanonicalJson.instant(value.proposedAt());
    }
  }

  public static final class CandidateModel extends EvidenceModel<CandidateModel> {
    @JsonProperty private final String id;
    @JsonIgnore private final TaskingSnapshot snapshot;

    public CandidateModel(String workspaceId, Tasking.Candidate candidate, UriInfo uriInfo) {
      Tasking.CandidateDescription value = candidate.getDescription();
      String iterationId = value.iteration().id();
      id = candidate.getIdentity();
      snapshot = new TaskingSnapshot(value);
      addSelf(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, iterationId, "tasking/candidates/" + id));
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "tasking"),
          "tasking");
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, iterationId, "tasking/decisions"),
          "decide");
    }

    @JsonProperty("planVersion")
    public int planVersion() {
      return snapshot.planVersion;
    }

    @JsonProperty("reference")
    public String reference() {
      return snapshot.reference;
    }

    @JsonProperty("storyId")
    public String storyId() {
      return snapshot.storyId;
    }

    @JsonProperty("storyRevisionId")
    public String storyRevisionId() {
      return snapshot.storyRevisionId;
    }

    @JsonProperty("storyRevisionSha256")
    public String storyRevisionSha256() {
      return snapshot.storyRevisionSha256;
    }

    @JsonProperty("baseCommitSha")
    public String baseCommitSha() {
      return snapshot.baseCommitSha;
    }

    @JsonProperty("noModelImpactDecisionId")
    public String noModelImpactDecisionId() {
      return snapshot.noModelImpactDecisionId;
    }

    @JsonProperty("noModelImpactDecisionSha256")
    public String noModelImpactDecisionSha256() {
      return snapshot.noModelImpactDecisionSha256;
    }

    @JsonProperty("sequence")
    public int sequence() {
      return snapshot.sequence;
    }

    @JsonProperty("projectCatalog")
    public Tasking.ProjectCatalog projectCatalog() {
      return snapshot.projectCatalog;
    }

    @JsonProperty("projectCatalogSha256")
    public String projectCatalogSha256() {
      return snapshot.projectCatalogSha256;
    }

    @JsonProperty("tests")
    public List<Tasking.TestDescription> tests() {
      return snapshot.tests;
    }

    @JsonProperty("tasks")
    public List<Tasking.TaskDescription> tasks() {
      return snapshot.tasks;
    }

    @JsonProperty("processes")
    public List<Tasking.ProcessSelection> processes() {
      return snapshot.processes;
    }

    @JsonProperty("executionBudget")
    public Tasking.ExecutionBudget executionBudget() {
      return snapshot.executionBudget;
    }

    @JsonProperty("contentSha256")
    public String contentSha256() {
      return snapshot.contentSha256;
    }

    @JsonProperty("proposedBy")
    public String proposedBy() {
      return snapshot.proposedBy;
    }

    @JsonProperty("proposedAt")
    public String proposedAt() {
      return snapshot.proposedAt;
    }
  }

  public static final class DecisionModel extends EvidenceModel<DecisionModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final String candidateId;
    @JsonProperty private final String candidateSha256;
    @JsonProperty private final String action;
    @JsonProperty private final String reason;
    @JsonProperty private final String decidedByUserId;
    @JsonProperty private final String decidedAt;
    @JsonProperty private final String contentSha256;

    private DecisionModel(String workspaceId, Tasking.Decision decision, UriInfo uriInfo) {
      Tasking.DecisionDescription value = decision.getDescription();
      String iterationId = value.iteration().id();
      id = decision.getIdentity();
      reference = value.reference();
      candidateId = value.candidate().id();
      candidateSha256 = value.candidateSha256();
      action = value.action().wireValue();
      reason = value.reason();
      decidedByUserId = value.decidedBy().id();
      decidedAt = CanonicalJson.instant(value.decidedAt());
      contentSha256 = value.contentSha256();
      addSelf(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, iterationId, "tasking/decisions/" + id));
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "tasking"),
          "tasking");
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
    }
  }

  public static final class ApprovedPlanModel extends EvidenceModel<ApprovedPlanModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String storyId;
    @JsonProperty private final String storyRevisionId;
    @JsonProperty private final String taskingCandidateId;
    @JsonProperty private final String deskCheckDecisionId;
    @JsonProperty private final TaskingSnapshot plan;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String approvedByUserId;
    @JsonProperty private final String approvedAt;

    public ApprovedPlanModel(String workspaceId, Tasking.ApprovedPlan approved, UriInfo uriInfo) {
      Tasking.ApprovedPlanDescription value = approved.getDescription();
      String iterationId = value.iteration().id();
      id = approved.getIdentity();
      storyId = value.story().id();
      storyRevisionId = value.storyRevision().id();
      taskingCandidateId = value.taskingCandidate().id();
      deskCheckDecisionId = value.deskCheckDecision().id();
      plan = new TaskingSnapshot(value.plan());
      contentSha256 = value.contentSha256();
      approvedByUserId = value.approvedBy().id();
      approvedAt = CanonicalJson.instant(value.approvedAt());
      addSelf(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, iterationId, "tasking/approved-plan"));
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "tasking"),
          "tasking");
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(ApiTemplates.workspaceStory(uriInfo, workspaceId, storyId), "story");
      addRelation(
          ApiTemplates.workspaceStoryRevision(uriInfo, workspaceId, storyId, storyRevisionId),
          "story-revision");
    }
  }

  public static final class TaskingModel extends EvidenceModel<TaskingModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final DeliveryModels.StoryModel story;
    @JsonProperty private final DeliveryModels.StoryRevisionModel storyRevision;
    @JsonProperty private final NoModelImpactModel noModelImpactDecision;
    @JsonProperty private final CandidateModel currentCandidate;
    @JsonProperty private final List<DecisionModel> decisions;
    @JsonProperty private final ApprovedPlanModel approvedPlan;
    @JsonProperty private final List<TaskingCatalog.Process> processCatalog;

    public TaskingModel(String workspaceId, Tasking.View view, UriInfo uriInfo) {
      String iterationId = view.iteration().getIdentity();
      iteration = new IterationModel(view.iteration(), uriInfo);
      story = new DeliveryModels.StoryModel(view.story(), uriInfo);
      storyRevision =
          new DeliveryModels.StoryRevisionModel(workspaceId, view.storyRevision(), uriInfo);
      noModelImpactDecision =
          view.noModelImpactDecision() == null
              ? null
              : new NoModelImpactModel(workspaceId, view.noModelImpactDecision(), uriInfo);
      currentCandidate =
          view.currentCandidate() == null
              ? null
              : new CandidateModel(workspaceId, view.currentCandidate(), uriInfo);
      decisions =
          view.decisions().stream()
              .map(value -> new DecisionModel(workspaceId, value, uriInfo))
              .toList();
      approvedPlan =
          view.approvedPlan() == null
              ? null
              : new ApprovedPlanModel(workspaceId, view.approvedPlan(), uriInfo);
      processCatalog = view.processCatalog();
      addSelf(ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "tasking"));
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceStory(uriInfo, workspaceId, view.story().getIdentity()), "story");
      addRelation(
          ApiTemplates.workspaceStoryRevision(
              uriInfo, workspaceId, view.story().getIdentity(), view.storyRevision().getIdentity()),
          "story-revision");
      String loop = view.iteration().getDescription().loop();
      String stage = view.iteration().getDescription().stage();
      if ("understand".equals(loop) && "modeling".equals(stage) && noModelImpactDecision == null) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "tasking/no-model-impact"),
            "record-no-model-impact");
      }
      if ("tasking".equals(loop)
          && ("drafting".equals(stage) || "knowledge_gap".equals(stage))
          && noModelImpactDecision != null) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "tasking/candidates"),
            "propose-candidate");
      }
      if ("tasking".equals(loop) && "desk_check".equals(stage) && currentCandidate != null) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "tasking/decisions"),
            "decide");
      }
      if ("tasking".equals(loop) && "approved".equals(stage) && approvedPlan != null) {
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "pair"),
            "pair");
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "pair/runs"),
            "start-pair");
      }
    }
  }

  public static final class DecisionResultModel extends EvidenceModel<DecisionResultModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final DecisionModel decision;
    @JsonProperty private final ApprovedPlanModel approvedPlan;

    public DecisionResultModel(String workspaceId, Tasking.DecisionResult result, UriInfo uriInfo) {
      String iterationId = result.iteration().getIdentity();
      iteration = new IterationModel(result.iteration(), uriInfo);
      decision = new DecisionModel(workspaceId, result.decision(), uriInfo);
      approvedPlan =
          result.approvedPlan() == null
              ? null
              : new ApprovedPlanModel(workspaceId, result.approvedPlan(), uriInfo);
      addSelf(
          ApiTemplates.workspaceIterationChild(
              uriInfo,
              workspaceId,
              iterationId,
              "tasking/decisions/" + result.decision().getIdentity()));
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "tasking"),
          "tasking");
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
    }
  }
}
