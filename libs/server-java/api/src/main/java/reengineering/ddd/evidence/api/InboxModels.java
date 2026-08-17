package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.hateoas.Link;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.domain.description.InboxExtractionDescription;
import reengineering.ddd.evidence.domain.description.InboxItemDescription;
import reengineering.ddd.evidence.domain.description.InboxRevisionDescription;
import reengineering.ddd.evidence.domain.description.InboxStoryCandidateDescription;
import reengineering.ddd.evidence.domain.description.IterationDescription;
import reengineering.ddd.evidence.domain.model.InboxExtraction;
import reengineering.ddd.evidence.domain.model.InboxItem;
import reengineering.ddd.evidence.domain.model.InboxRevision;
import reengineering.ddd.evidence.domain.model.InboxStoryCandidate;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Iteration;

public final class InboxModels {
  private InboxModels() {}

  public static final class ItemModel extends EvidenceModel<ItemModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String sourceKind;
    @JsonProperty private final String externalKey;
    @JsonProperty private final String title;
    @JsonProperty private final String status;
    @JsonProperty private final String latestRevisionId;
    @JsonProperty private final String latestRevisionSha256;
    @JsonProperty private final int revisionCount;
    @JsonProperty private final int version;
    @JsonProperty private final String createdAt;
    @JsonProperty private final String updatedAt;

    public ItemModel(InboxItem item, UriInfo uriInfo) {
      InboxItemDescription value = item.getDescription();
      String workspaceId = value.workspace().id();
      id = item.getIdentity();
      sourceKind = value.sourceKind();
      externalKey = value.externalKey();
      title = value.title();
      status = value.status().wireValue();
      latestRevisionId = value.latestRevisionId();
      latestRevisionSha256 = value.latestRevisionSha256();
      revisionCount = value.revisionCount();
      version = value.version();
      createdAt = instant(value.createdAt());
      updatedAt = instant(value.updatedAt());
      addSelf(ApiTemplates.workspaceInboxItem(uriInfo, workspaceId, id));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(ApiTemplates.workspaceInboxItems(uriInfo, workspaceId), "collection");
      addRelation(ApiTemplates.workspaceInboxRevisions(uriInfo, workspaceId, id), "revisions");
      addRelation(ApiTemplates.workspaceStoryCandidates(uriInfo, workspaceId), "story-candidates");
      addRelation(
          ApiTemplates.workspaceInboxExtractions(uriInfo, workspaceId), "inbox-extractions");
      addRelation(
          ApiTemplates.workspaceInboxRevision(uriInfo, workspaceId, id, latestRevisionId),
          "latest-revision");
    }
  }

  public static final class RevisionModel extends EvidenceModel<RevisionModel> {
    @JsonProperty private final String id;
    @JsonProperty private final int revisionNumber;
    @JsonProperty private final String title;
    @JsonProperty private final String body;
    @JsonProperty private final String contentType;
    @JsonProperty private final String uri;
    @JsonProperty private final Map<String, Object> providerMetadata;
    @JsonProperty private final String sourceUpdatedAt;
    @JsonProperty private final String capturedAt;
    @JsonProperty private final String contentSha256;

    public RevisionModel(String workspaceId, InboxRevision revision, UriInfo uriInfo) {
      InboxRevisionDescription value = revision.getDescription();
      String itemId = value.item().id();
      id = revision.getIdentity();
      revisionNumber = value.revisionNumber();
      title = value.title();
      body = value.body();
      contentType = value.contentType().wireValue();
      uri = value.uri();
      providerMetadata = value.providerMetadata();
      sourceUpdatedAt = instant(value.sourceUpdatedAt());
      capturedAt = instant(value.capturedAt());
      contentSha256 = value.contentSha256();
      addSelf(ApiTemplates.workspaceInboxRevision(uriInfo, workspaceId, itemId, id));
      addRelation(ApiTemplates.workspaceInboxItem(uriInfo, workspaceId, itemId), "item");
      addRelation(ApiTemplates.workspaceInboxRevisions(uriInfo, workspaceId, itemId), "collection");
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(ApiTemplates.workspaceStoryCandidates(uriInfo, workspaceId), "story-candidates");
    }
  }

  public static final class ExtractionModel extends EvidenceModel<ExtractionModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final String status;
    @JsonProperty private final List<ExtractionSourceModel> sources;
    @JsonProperty private final int version;
    @JsonProperty private final String requestedByUserId;
    @JsonProperty private final String requestedAt;
    @JsonProperty private final String completedAt;
    @JsonProperty private final String failureSummary;

    public ExtractionModel(InboxExtraction extraction, UriInfo uriInfo) {
      InboxExtractionDescription value = extraction.getDescription();
      String workspaceId = value.workspace().id();
      id = extraction.getIdentity();
      reference = value.reference();
      status = value.status().wireValue();
      sources =
          value.sources().stream()
              .map(source -> new ExtractionSourceModel(workspaceId, source, uriInfo))
              .toList();
      version = value.version();
      requestedByUserId = value.requestedBy().id();
      requestedAt = instant(value.requestedAt());
      completedAt = instant(value.completedAt());
      failureSummary = value.failureSummary();
      addSelf(ApiTemplates.workspaceInboxExtraction(uriInfo, workspaceId, id));
      addRelation(ApiTemplates.workspaceInboxExtractions(uriInfo, workspaceId), "collection");
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(
          ApiTemplates.workspaceExtractionStoryCandidates(uriInfo, workspaceId, id),
          "story-candidates");
      if (value.status() == InboxWorkflow.ExtractionStatus.AWAITING_AGENT) {
        addRelation(
            ApiTemplates.workspaceInboxExtractionCandidates(uriInfo, workspaceId, id),
            "propose-candidates");
      }
    }
  }

  public static final class ExtractionSourceModel {
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
    @JsonProperty private final Map<String, Link> locatorLinks;

    private ExtractionSourceModel(
        String workspaceId, InboxWorkflow.ExtractionSource source, UriInfo uriInfo) {
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
      sourceUpdatedAt = instant(source.sourceUpdatedAt());
      capturedAt = instant(source.capturedAt());
      contentSha256 = source.contentSha256();
      locatorLinks =
          Map.of(
              "item", relative(ApiTemplates.workspaceInboxItem(uriInfo, workspaceId, inboxItemId)),
              "revision",
                  relative(
                      ApiTemplates.workspaceInboxRevision(
                          uriInfo, workspaceId, inboxItemId, inboxRevisionId)));
    }
  }

  public static final class CandidateModel extends EvidenceModel<CandidateModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final String extractionId;
    @JsonProperty private final String title;
    @JsonProperty private final String problem;
    @JsonProperty private final String role;
    @JsonProperty private final String goal;
    @JsonProperty private final String value;
    @JsonProperty private final String cognitiveMode;
    @JsonProperty private final List<CandidateCitationModel> citations;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String status;
    @JsonProperty private final String proposedBy;
    @JsonProperty private final String proposedAt;
    @JsonProperty private final String terminalDecisionId;
    @JsonProperty private final String selectedIterationId;

    public CandidateModel(InboxStoryCandidate candidate, UriInfo uriInfo) {
      InboxStoryCandidateDescription value = candidate.getDescription();
      String workspaceId = value.workspace().id();
      id = candidate.getIdentity();
      reference = value.reference();
      extractionId = value.extraction().id();
      title = value.title();
      problem = value.problem();
      role = value.role();
      goal = value.goal();
      this.value = value.value();
      cognitiveMode = value.cognitiveMode().wireValue();
      citations =
          value.citations().stream()
              .map(citation -> new CandidateCitationModel(workspaceId, citation, uriInfo))
              .toList();
      contentSha256 = value.contentSha256();
      status = value.status().wireValue();
      proposedBy = value.proposedBy();
      proposedAt = instant(value.proposedAt());
      terminalDecisionId = value.terminalDecision() == null ? null : value.terminalDecision().id();
      selectedIterationId =
          value.selectedIteration() == null ? null : value.selectedIteration().id();
      addSelf(ApiTemplates.workspaceStoryCandidate(uriInfo, workspaceId, id));
      addRelation(ApiTemplates.workspaceStoryCandidates(uriInfo, workspaceId), "collection");
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(
          ApiTemplates.workspaceInboxExtraction(uriInfo, workspaceId, extractionId), "extraction");
      if (value.status() == InboxWorkflow.CandidateStatus.READY
          || value.status() == InboxWorkflow.CandidateStatus.STALE) {
        addRelation(
            ApiTemplates.workspaceStoryCandidateAction(uriInfo, workspaceId, id, "defer"), "defer");
        addRelation(
            ApiTemplates.workspaceStoryCandidateAction(uriInfo, workspaceId, id, "reject"),
            "reject");
      }
      if (value.status() == InboxWorkflow.CandidateStatus.READY) {
        addRelation(
            ApiTemplates.workspaceStoryCandidateAction(uriInfo, workspaceId, id, "select"),
            "select");
      }
      if (selectedIterationId != null) {
        addRelation(
            ApiTemplates.workspaceIteration(uriInfo, workspaceId, selectedIterationId),
            "iteration");
      }
    }
  }

  public static final class CandidateCitationModel extends EvidenceModel<CandidateCitationModel> {
    @JsonProperty private final String inboxItemId;
    @JsonProperty private final String inboxRevisionId;
    @JsonProperty private final int revisionNumber;
    @JsonProperty private final String revisionSha256;
    @JsonProperty private final String locator;

    private CandidateCitationModel(
        String workspaceId, InboxWorkflow.CandidateCitation citation, UriInfo uriInfo) {
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

  public static final class IterationModel extends EvidenceModel<IterationModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String reference;
    @JsonProperty private final String sourceCandidateId;
    @JsonProperty private final String sourceCandidateSha256;
    @JsonProperty private final String lifecycle;
    @JsonProperty private final String loop;
    @JsonProperty private final String stage;
    @JsonProperty private final String lane;
    @JsonProperty private final int version;
    @JsonProperty private final String baseCommitSha;
    @JsonProperty private final String branchName;
    @JsonProperty private final String provisioningFailureSummary;
    @JsonProperty private final String activeStoryId;
    @JsonProperty private final String admittedByUserId;
    @JsonProperty private final String admittedAt;
    @JsonProperty private final String updatedAt;

    public IterationModel(Iteration iteration, UriInfo uriInfo) {
      IterationDescription value = iteration.getDescription();
      String workspaceId = value.workspace().id();
      id = iteration.getIdentity();
      reference = value.reference();
      sourceCandidateId = value.sourceCandidate().id();
      sourceCandidateSha256 = value.sourceCandidateSha256();
      lifecycle = value.lifecycle();
      loop = value.loop();
      stage = value.stage();
      lane = value.lane();
      version = value.version();
      baseCommitSha = value.baseCommitSha();
      branchName = value.branchName();
      provisioningFailureSummary = value.provisioningFailureSummary();
      activeStoryId = value.activeStory() == null ? null : value.activeStory().id();
      admittedByUserId = value.admittedBy().id();
      admittedAt = instant(value.admittedAt());
      updatedAt = instant(value.updatedAt());
      addSelf(ApiTemplates.workspaceIteration(uriInfo, workspaceId, id));
      addRelation(ApiTemplates.workspaceIterations(uriInfo, workspaceId), "collection");
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(
          ApiTemplates.workspaceStoryCandidate(uriInfo, workspaceId, sourceCandidateId),
          "candidate");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, id, "intake"), "intake");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, id, "kickoff"), "kickoff");
      if ("provisioning".equals(lifecycle)) {
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, id, "provisioning/complete"),
            "complete-provisioning");
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, id, "provisioning/fail"),
            "fail-provisioning");
      }
      if (activeStoryId != null) {
        addRelation(ApiTemplates.workspaceStory(uriInfo, workspaceId, activeStoryId), "story");
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, id, "understanding"),
            "understanding");
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, id, "tasking"), "tasking");
      }
    }
  }

  private static String instant(Instant value) {
    return value == null ? null : reengineering.ddd.evidence.domain.CanonicalJson.instant(value);
  }

  private static Link relative(URI uri) {
    String href =
        uri.getRawQuery() == null ? uri.getPath() : uri.getPath() + "?" + uri.getRawQuery();
    return Link.of(href);
  }
}
