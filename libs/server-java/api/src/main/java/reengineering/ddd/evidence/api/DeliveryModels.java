package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.model.Delivery;

public final class DeliveryModels {
  private DeliveryModels() {}

  public static final class StoryModel extends EvidenceModel<StoryModel> {
    @JsonProperty private final String id;
    @JsonProperty private final String iterationId;
    @JsonProperty private final String iterationReference;
    @JsonProperty private final String iterationLifecycle;
    @JsonProperty private final String iterationLoop;
    @JsonProperty private final String iterationStage;
    @JsonProperty private final String reference = "US-001";
    @JsonProperty private final String title;
    @JsonProperty private final String goal;
    @JsonProperty private final String latestRevisionId;
    @JsonProperty private final int latestRevisionNumber;
    @JsonProperty private final int latestScenarioCount;
    @JsonProperty private final int latestCitationCount;
    @JsonProperty private final String pendingClarificationReference;
    @JsonProperty private final Delivery.Authority authority;
    @JsonProperty private final int revisionCount;
    @JsonProperty private final int version;
    @JsonProperty private final String createdAt;
    @JsonProperty private final String updatedAt;

    public StoryModel(Delivery.Story story, UriInfo uriInfo) {
      Delivery.StoryDescription value = story.getDescription();
      String workspaceId = value.workspace().id();
      id = story.getIdentity();
      iterationId = value.iteration().id();
      iterationReference = value.iterationReference();
      iterationLifecycle = value.iterationLifecycle();
      iterationLoop = value.iterationLoop();
      iterationStage = value.iterationStage();
      title = value.title();
      goal = value.goal();
      latestRevisionId = value.latestRevision().id();
      latestRevisionNumber = value.latestRevisionNumber();
      latestScenarioCount = value.latestScenarioCount();
      latestCitationCount = value.latestCitationCount();
      pendingClarificationReference = value.pendingClarificationReference();
      authority = value.authority();
      revisionCount = value.revisionCount();
      version = value.version();
      createdAt = CanonicalJson.instant(value.createdAt());
      updatedAt = CanonicalJson.instant(value.updatedAt());
      addSelf(ApiTemplates.workspaceStory(uriInfo, workspaceId, id));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(ApiTemplates.workspaceStories(uriInfo, workspaceId), "collection");
      addRelation(ApiTemplates.workspaceIteration(uriInfo, workspaceId, iterationId), "iteration");
      addRelation(
          ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "understanding"),
          "understanding");
      addRelation(ApiTemplates.workspaceStoryRevisions(uriInfo, workspaceId, id), "revisions");
      addRelation(
          ApiTemplates.workspaceStoryRevision(uriInfo, workspaceId, id, latestRevisionId),
          "latest-revision");
      if ("tasking".equals(iterationLoop) || "pair".equals(iterationLoop)) {
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "tasking"),
            "tasking");
      }
      if ("pair".equals(iterationLoop)) {
        addRelation(
            ApiTemplates.workspaceIterationChild(uriInfo, workspaceId, iterationId, "pair"),
            "pair");
      }
    }
  }

  public static final class StoryRevisionModel extends EvidenceModel<StoryRevisionModel> {
    @JsonProperty private final String id;
    @JsonProperty private final int revisionNumber;
    @JsonProperty private final String title;
    @JsonProperty private final String problem;
    @JsonProperty private final String role;
    @JsonProperty private final String goal;
    @JsonProperty private final String value;
    @JsonProperty private final String cognitiveMode;
    @JsonProperty private final List<CitationModel> citations;
    @JsonProperty private final List<Delivery.Scenario> scenarios;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String createdByUserId;
    @JsonProperty private final String createdAt;

    public StoryRevisionModel(
        String workspaceId, Delivery.StoryRevision revision, UriInfo uriInfo) {
      Delivery.StoryRevisionDescription value = revision.getDescription();
      String storyId = value.story().id();
      id = revision.getIdentity();
      revisionNumber = value.revisionNumber();
      title = value.title();
      problem = value.problem();
      role = value.role();
      goal = value.goal();
      this.value = value.value();
      cognitiveMode = value.cognitiveMode().wireValue();
      citations =
          value.citations().stream()
              .map(citation -> new CitationModel(workspaceId, citation, uriInfo))
              .toList();
      scenarios = value.scenarios();
      contentSha256 = value.contentSha256();
      createdByUserId = value.createdBy().id();
      createdAt = CanonicalJson.instant(value.createdAt());
      addSelf(ApiTemplates.workspaceStoryRevision(uriInfo, workspaceId, storyId, id));
      addRelation(ApiTemplates.workspaceStory(uriInfo, workspaceId, storyId), "story");
      addRelation(
          ApiTemplates.workspaceStoryRevisions(uriInfo, workspaceId, storyId), "collection");
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(ApiTemplates.user(uriInfo, createdByUserId), "created-by");
    }
  }

  public static final class CitationModel extends EvidenceModel<CitationModel> {
    @JsonProperty private final String inboxItemId;
    @JsonProperty private final String inboxRevisionId;
    @JsonProperty private final int inboxRevisionNumber;
    @JsonProperty private final String contentSha256;
    @JsonProperty private final String locator;

    private CitationModel(String workspaceId, Delivery.Citation citation, UriInfo uriInfo) {
      inboxItemId = citation.inboxItem().id();
      inboxRevisionId = citation.inboxRevision().id();
      inboxRevisionNumber = citation.inboxRevisionNumber();
      contentSha256 = citation.contentSha256();
      locator = citation.locator();
      addRelation(ApiTemplates.workspaceInboxItem(uriInfo, workspaceId, inboxItemId), "item");
      addRelation(
          ApiTemplates.workspaceInboxRevision(uriInfo, workspaceId, inboxItemId, inboxRevisionId),
          "revision");
    }
  }

  public static final class StoryCollectionModel extends EvidenceModel<StoryCollectionModel> {
    @JsonProperty("_embedded")
    private final Embedded embedded;

    @JsonProperty private final reengineering.ddd.evidence.api.representation.PageModel page;
    @JsonProperty private final Delivery.PortfolioSummary summary;

    public StoryCollectionModel(
        String workspaceId,
        Delivery.Page<Delivery.Story> stories,
        Delivery.PortfolioSummary summary,
        int pageNumber,
        int pageSize,
        UriInfo uriInfo) {
      embedded =
          new Embedded(
              stories.items().stream().map(story -> new StoryModel(story, uriInfo)).toList());
      page =
          reengineering.ddd.evidence.api.representation.PageModel.of(
              pageNumber, pageSize, stories.total());
      this.summary = summary;
      addSelf(ApiTemplates.workspaceStoriesPage(uriInfo, workspaceId, pageNumber, pageSize));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      if (pageNumber > 1) {
        addRelation(
            ApiTemplates.workspaceStoriesPage(uriInfo, workspaceId, pageNumber - 1, pageSize),
            "prev");
      }
      if (pageNumber < page.totalPages()) {
        addRelation(
            ApiTemplates.workspaceStoriesPage(uriInfo, workspaceId, pageNumber + 1, pageSize),
            "next");
      }
    }

    private record Embedded(@JsonProperty("stories") List<StoryModel> stories) {}
  }

  public static final class RevisionCollectionModel extends EvidenceModel<RevisionCollectionModel> {
    @JsonProperty("_embedded")
    private final Embedded embedded;

    @JsonProperty private final reengineering.ddd.evidence.api.representation.PageModel page;

    public RevisionCollectionModel(
        String workspaceId,
        String storyId,
        Delivery.Page<Delivery.StoryRevision> revisions,
        int pageNumber,
        int pageSize,
        UriInfo uriInfo) {
      embedded =
          new Embedded(
              revisions.items().stream()
                  .map(revision -> new StoryRevisionModel(workspaceId, revision, uriInfo))
                  .toList());
      page =
          reengineering.ddd.evidence.api.representation.PageModel.of(
              pageNumber, pageSize, revisions.total());
      addSelf(
          ApiTemplates.workspaceStoryRevisionsPage(
              uriInfo, workspaceId, storyId, pageNumber, pageSize));
      addRelation(ApiTemplates.workspaceStory(uriInfo, workspaceId, storyId), "story");
      if (pageNumber > 1) {
        addRelation(
            ApiTemplates.workspaceStoryRevisionsPage(
                uriInfo, workspaceId, storyId, pageNumber - 1, pageSize),
            "prev");
      }
      if (pageNumber < page.totalPages()) {
        addRelation(
            ApiTemplates.workspaceStoryRevisionsPage(
                uriInfo, workspaceId, storyId, pageNumber + 1, pageSize),
            "next");
      }
    }

    private record Embedded(
        @JsonProperty("storyRevisions") List<StoryRevisionModel> storyRevisions) {}
  }
}
