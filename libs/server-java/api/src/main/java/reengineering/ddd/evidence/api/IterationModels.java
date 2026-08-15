package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.api.InboxModels.IterationModel;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;

public final class IterationModels {
  private IterationModels() {}

  public static final class IntakeModel extends EvidenceModel<IntakeModel> {
    @JsonProperty private final String iterationId;
    @JsonProperty private final CandidateSnapshot candidate;
    @JsonProperty private final List<SourceSnapshot> sources;
    @JsonProperty private final String requirementsProjection;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String frozenAt;

    public IntakeModel(String workspaceId, IterationWorkflow.Intake intake, UriInfo uriInfo) {
      IterationWorkflow.IntakeDescription value = intake.getDescription();
      iterationId = value.iteration().id();
      candidate = new CandidateSnapshot(workspaceId, value.candidate(), uriInfo);
      sources =
          value.sources().stream()
              .map(source -> new SourceSnapshot(workspaceId, source, uriInfo))
              .toList();
      requirementsProjection = value.requirementsProjection();
      contentSha256 = value.contentSha256();
      frozenAt = CanonicalJson.instant(value.frozenAt());
      addSelf(ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "intake"));
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
    }
  }

  public static final class CandidateSnapshot {
    @JsonProperty private final String candidateId;
    @JsonProperty private final String candidateReference;
    @JsonProperty private final String extractionId;
    @JsonProperty private final String title;
    @JsonProperty private final String problem;
    @JsonProperty private final String role;
    @JsonProperty private final String goal;
    @JsonProperty private final String value;
    @JsonProperty private final String cognitiveMode;
    @JsonProperty private final List<FrozenCitationModel> citations;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String proposedAt;

    private CandidateSnapshot(
        String workspaceId, IterationWorkflow.FrozenCandidate candidate, UriInfo uriInfo) {
      candidateId = candidate.candidateId();
      candidateReference = candidate.candidateReference();
      extractionId = candidate.extractionId();
      title = candidate.title();
      problem = candidate.problem();
      role = candidate.role();
      goal = candidate.goal();
      value = candidate.value();
      cognitiveMode = candidate.cognitiveMode().wireValue();
      citations =
          candidate.citations().stream()
              .map(value -> new FrozenCitationModel(workspaceId, value, uriInfo))
              .toList();
      contentSha256 = candidate.contentSha256();
      proposedAt = CanonicalJson.instant(candidate.proposedAt());
    }
  }

  public static final class SourceSnapshot {
    @JsonProperty private final String inboxItemId;
    @JsonProperty private final String inboxRevisionId;
    @JsonProperty private final int revisionNumber;
    @JsonProperty private final String sourceKind;
    @JsonProperty private final String externalKey;
    @JsonProperty private final String itemStatus;
    @JsonProperty private final String title;
    @JsonProperty private final String body;
    @JsonProperty private final String contentType;
    @JsonProperty private final String uri;
    @JsonProperty private final Map<String, Object> providerMetadata;
    @JsonProperty private final String sourceUpdatedAt;
    @JsonProperty private final String capturedAt;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final Map<String, org.springframework.hateoas.Link> locatorLinks;

    private SourceSnapshot(
        String workspaceId, IterationWorkflow.FrozenSource source, UriInfo uriInfo) {
      inboxItemId = source.inboxItem().id();
      inboxRevisionId = source.inboxRevision().id();
      revisionNumber = source.revisionNumber();
      sourceKind = source.sourceKind();
      externalKey = source.externalKey();
      itemStatus = source.itemStatus().wireValue();
      title = source.title();
      body = source.body();
      contentType = source.contentType().wireValue();
      uri = source.uri();
      providerMetadata = source.providerMetadata();
      sourceUpdatedAt =
          source.sourceUpdatedAt() == null ? null : CanonicalJson.instant(source.sourceUpdatedAt());
      capturedAt = CanonicalJson.instant(source.capturedAt());
      contentSha256 = source.contentSha256();
      locatorLinks =
          Map.of(
              "item",
                  org.springframework.hateoas.Link.of(
                      ApiTemplates.workspaceInboxItem(uriInfo, workspaceId, inboxItemId).getPath()),
              "revision",
                  org.springframework.hateoas.Link.of(
                      ApiTemplates.workspaceInboxRevision(
                              uriInfo, workspaceId, inboxItemId, inboxRevisionId)
                          .getPath()));
    }
  }

  public static final class FrozenCitationModel extends EvidenceModel<FrozenCitationModel> {
    @JsonProperty private final String inboxItemId;
    @JsonProperty private final String inboxRevisionId;
    @JsonProperty private final int revisionNumber;
    @JsonProperty private final String revisionSha256;
    @JsonProperty private final String locator;

    public FrozenCitationModel(
        String workspaceId, IterationWorkflow.FrozenCitation citation, UriInfo uriInfo) {
      inboxItemId = citation.inboxItem().id();
      inboxRevisionId = citation.inboxRevision().id();
      revisionNumber = citation.revisionNumber();
      revisionSha256 = citation.revisionSha256();
      locator = citation.locator();
      addRelation(ApiTemplates.workspaceInboxItem(uriInfo, workspaceId, inboxItemId), "item");
      addRelation(
          ApiTemplates.workspaceInboxRevision(uriInfo, workspaceId, inboxItemId, inboxRevisionId),
          "revision");
    }
  }

  public static final class KickoffProposalModel extends EvidenceModel<KickoffProposalModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final int sequence;
    @JsonProperty private final String origin;
    @JsonProperty private final String title;
    @JsonProperty private final String problem;
    @JsonProperty private final String role;
    @JsonProperty private final String goal;
    @JsonProperty private final String value;
    @JsonProperty private final String cognitiveMode;
    @JsonProperty private final List<FrozenCitationModel> citations;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String proposedAt;

    public KickoffProposalModel(
        String workspaceId, IterationWorkflow.KickoffProposal proposal, UriInfo uriInfo) {
      IterationWorkflow.KickoffProposalDescription value = proposal.getDescription();
      String iterationId = value.iteration().id();
      id = proposal.getIdentity();
      reference = value.reference();
      sequence = value.sequence();
      origin = value.origin().wireValue();
      title = value.title();
      problem = value.problem();
      role = value.role();
      goal = value.goal();
      this.value = value.value();
      cognitiveMode = value.cognitiveMode().wireValue();
      citations =
          value.citations().stream()
              .map(citation -> new FrozenCitationModel(workspaceId, citation, uriInfo))
              .toList();
      contentSha256 = value.contentSha256();
      proposedAt = CanonicalJson.instant(value.proposedAt());
      addSelf(ApiTemplates.workspaceKickoffProposal(uriInfo, workspaceId, iterationId, id));
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(
              uriInfo, workspaceId, iterationId, "kickoff/decisions"),
          "decide");
    }
  }

  public static final class KickoffDecisionModel extends EvidenceModel<KickoffDecisionModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final String proposalId;
    @JsonProperty private final String proposalSha256;
    @JsonProperty private final String action;
    @JsonProperty private final String reason;
    @JsonProperty private final String decidedByUserId;
    @JsonProperty private final String decidedAt;
    @JsonProperty private final String contentSha256;

    public KickoffDecisionModel(
        String workspaceId, IterationWorkflow.KickoffDecision decision, UriInfo uriInfo) {
      IterationWorkflow.KickoffDecisionDescription value = decision.getDescription();
      String iterationId = value.iteration().id();
      id = decision.getIdentity();
      reference = value.reference();
      proposalId = value.proposal().id();
      proposalSha256 = value.proposalSha256();
      action = value.action().wireValue();
      reason = value.reason();
      decidedByUserId = value.decidedBy().id();
      decidedAt = CanonicalJson.instant(value.decidedAt());
      contentSha256 = value.contentSha256();
      addSelf(ApiTemplates.workspaceKickoffDecision(uriInfo, workspaceId, iterationId, id));
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
    }
  }

  public static final class KickoffModel extends EvidenceModel<KickoffModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final IntakeModel intake;
    @JsonProperty private final KickoffProposalModel currentProposal;
    @JsonProperty private final List<KickoffDecisionModel> decisions;

    public KickoffModel(String workspaceId, IterationWorkflow.KickoffView view, UriInfo uriInfo) {
      String iterationId = view.iteration().getIdentity();
      iteration = new IterationModel(view.iteration(), uriInfo);
      intake = new IntakeModel(workspaceId, view.intake(), uriInfo);
      currentProposal =
          view.currentProposal() == null
              ? null
              : new KickoffProposalModel(workspaceId, view.currentProposal(), uriInfo);
      decisions =
          view.decisions().stream()
              .map(value -> new KickoffDecisionModel(workspaceId, value, uriInfo))
              .toList();
      addSelf(ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "kickoff"));
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "intake"),
          "intake");
      if ("active".equals(view.iteration().getDescription().lifecycle())
          && "kickoff".equals(view.iteration().getDescription().loop())
          && "candidate_drafting".equals(view.iteration().getDescription().stage())) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "kickoff/proposals"),
            "propose-replacement");
      }
      if (currentProposal != null) {
        addRelation(
            ApiTemplates.workspaceIterationChild(
                uriInfo, workspaceId, iterationId, "kickoff/decisions"),
            "decide");
      }
    }
  }

  public static final class ProblemStatementModel {
    @JsonProperty private final String id;
    @JsonProperty private final String storyId;
    @JsonProperty private final int revisionNumber;
    @JsonProperty private final String title;
    @JsonProperty private final String problem;
    @JsonProperty private final String cognitiveMode;
    @JsonProperty private final List<FrozenCitationModel> citations;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String createdAt;

    private ProblemStatementModel(
        String workspaceId, IterationWorkflow.ProblemStatement value, UriInfo uriInfo) {
      IterationWorkflow.ProblemStatementDescription description = value.getDescription();
      id = value.getIdentity();
      storyId = description.story().id();
      revisionNumber = description.revisionNumber();
      title = description.title();
      problem = description.problem();
      cognitiveMode = description.cognitiveMode().wireValue();
      citations =
          description.citations().stream()
              .map(citation -> new FrozenCitationModel(workspaceId, citation, uriInfo))
              .toList();
      contentSha256 = description.contentSha256();
      createdAt = CanonicalJson.instant(description.createdAt());
    }
  }

  public static final class StoryCardModel {
    @JsonProperty private final String id;
    @JsonProperty private final String reference = "US-001";
    @JsonProperty private final String storyId;
    @JsonProperty private final int revisionNumber;
    @JsonProperty private final String title;
    @JsonProperty private final String role;
    @JsonProperty private final String goal;
    @JsonProperty private final String value;
    @JsonProperty private final String problemStatementId;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String createdAt;

    private StoryCardModel(IterationWorkflow.StoryCard value) {
      IterationWorkflow.StoryCardDescription description = value.getDescription();
      id = value.getIdentity();
      storyId = description.story().id();
      revisionNumber = description.revisionNumber();
      title = description.title();
      role = description.role();
      goal = description.goal();
      this.value = description.value();
      problemStatementId = description.problemStatement().id();
      contentSha256 = description.contentSha256();
      createdAt = CanonicalJson.instant(description.createdAt());
    }
  }

  public static final class KickoffDecisionResultModel
      extends EvidenceModel<KickoffDecisionResultModel> {
    @JsonProperty private final IterationModel iteration;
    @JsonProperty private final KickoffDecisionModel decision;
    @JsonProperty private final ProblemStatementModel problemStatement;
    @JsonProperty private final StoryCardModel storyCard;

    public KickoffDecisionResultModel(
        String workspaceId, IterationWorkflow.KickoffDecisionResult result, UriInfo uriInfo) {
      String iterationId = result.iteration().getIdentity();
      iteration = new IterationModel(result.iteration(), uriInfo);
      decision = new KickoffDecisionModel(workspaceId, result.decision(), uriInfo);
      problemStatement =
          result.problemStatement() == null
              ? null
              : new ProblemStatementModel(workspaceId, result.problemStatement(), uriInfo);
      storyCard = result.storyCard() == null ? null : new StoryCardModel(result.storyCard());
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "kickoff"),
          "kickoff");
    }
  }
}
