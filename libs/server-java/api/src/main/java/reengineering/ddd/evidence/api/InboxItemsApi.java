package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;
import java.util.List;
import reengineering.ddd.evidence.api.InboxModels.ItemModel;
import reengineering.ddd.evidence.api.InboxModels.RevisionModel;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.api.representation.PageModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.Inbox;

public final class InboxItemsApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceService workspaces;

  public InboxItemsApi(String actorUserId, String workspaceId, WorkspaceService workspaces) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaces = workspaces;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_ITEMS)
  public ItemCollectionModel list(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @QueryParam("status") String statusInput,
      @QueryParam("sourceKind") String sourceKindInput,
      @QueryParam("q") String queryInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    String statusValue = optionalQuery(statusInput);
    Inbox.ItemStatus status = statusValue == null ? null : Inbox.ItemStatus.parse(statusValue);
    String sourceKind = optionalQuery(sourceKindInput);
    String query = optionalQuery(queryInput);
    return new ItemCollectionModel(
        workspaceId,
        workspaces.inboxItems(
            actorUserId,
            workspaceId,
            new Inbox.ListQuery(page, pageSize, status, sourceKind, query)),
        page,
        pageSize,
        statusValue,
        sourceKind,
        query,
        uriInfo);
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_ITEM)
  public Response capture(JsonNode input, @Context UriInfo uriInfo) {
    Inbox.Captured captured =
        workspaces.captureInboxItem(actorUserId, workspaceId, InboxRequests.source(input));
    return Response.status(Response.Status.CREATED)
        .entity(new ItemModel(captured.item(), uriInfo))
        .build();
  }

  @GET
  @Path("{itemId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_ITEM)
  public ItemModel get(@PathParam("itemId") String itemId, @Context UriInfo uriInfo) {
    return new ItemModel(workspaces.requireInboxItem(actorUserId, workspaceId, itemId), uriInfo);
  }

  @PATCH
  @Path("{itemId}")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_ITEM)
  public ItemModel changeStatus(
      @PathParam("itemId") String itemId, JsonNode input, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(input, "request body is required");
    return new ItemModel(
        workspaces.changeInboxStatus(
            actorUserId,
            workspaceId,
            itemId,
            Inbox.ItemStatus.parse(InboxRequests.requiredString(input.get("status"), "status")),
            InboxRequests.positiveInteger(input.get("expectedVersion"), "expectedVersion")),
        uriInfo);
  }

  @GET
  @Path("{itemId}/revisions")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_REVISIONS)
  public RevisionCollectionModel revisions(
      @PathParam("itemId") String itemId,
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    return new RevisionCollectionModel(
        workspaceId,
        itemId,
        workspaces.inboxRevisions(actorUserId, workspaceId, itemId, page, pageSize),
        page,
        pageSize,
        uriInfo);
  }

  @POST
  @Path("{itemId}/revisions")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_REVISION)
  public RevisionModel appendRevision(
      @PathParam("itemId") String itemId, JsonNode input, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(input, "request body is required");
    Inbox.Item item = workspaces.requireInboxItem(actorUserId, workspaceId, itemId);
    Inbox.Revision latest =
        workspaces.requireInboxRevision(
            actorUserId, workspaceId, itemId, item.getDescription().latestRevisionId());
    Inbox.RevisionDescription previous = latest.getDescription();
    Inbox.SourceInput source =
        new Inbox.SourceInput(
            item.getDescription().sourceKind(),
            item.getDescription().externalKey(),
            input.hasNonNull("title")
                ? InboxRequests.requiredString(input.get("title"), "title", true)
                : previous.title(),
            input.hasNonNull("body")
                ? InboxRequests.requiredString(input.get("body"), "body", false)
                : previous.body(),
            input.hasNonNull("contentType")
                ? InboxRequests.requiredString(input.get("contentType"), "contentType", true)
                : previous.contentType().wireValue(),
            input.has("uri")
                ? InboxRequests.optionalString(input.get("uri"), "uri")
                : previous.uri(),
            input.has("providerMetadata")
                ? InboxRequests.metadata(input.get("providerMetadata"))
                : previous.providerMetadata(),
            input.has("sourceUpdatedAt")
                ? InboxRequests.optionalString(input.get("sourceUpdatedAt"), "sourceUpdatedAt")
                : previous.sourceUpdatedAt() == null
                    ? null
                    : reengineering.ddd.evidence.domain.CanonicalJson.instant(
                        previous.sourceUpdatedAt()));
    Inbox.Captured captured =
        workspaces.appendInboxRevision(
            actorUserId,
            workspaceId,
            itemId,
            source,
            InboxRequests.requiredString(
                input.get("expectedLatestRevisionSha256"), "expectedLatestRevisionSha256"));
    return new RevisionModel(workspaceId, captured.revision(), uriInfo);
  }

  @GET
  @Path("{itemId}/revisions/{revisionId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_REVISION)
  public RevisionModel revision(
      @PathParam("itemId") String itemId,
      @PathParam("revisionId") String revisionId,
      @Context UriInfo uriInfo) {
    return new RevisionModel(
        workspaceId,
        workspaces.requireInboxRevision(actorUserId, workspaceId, itemId, revisionId),
        uriInfo);
  }

  public static final class ItemCollectionModel extends EvidenceModel<ItemCollectionModel> {
    @JsonProperty("_embedded")
    private final ItemEmbedded embedded;

    @JsonProperty private final PageModel page;

    private ItemCollectionModel(
        String workspaceId,
        Inbox.Page<Inbox.Item> items,
        int pageNumber,
        int pageSize,
        String status,
        String sourceKind,
        String query,
        UriInfo uriInfo) {
      embedded =
          new ItemEmbedded(
              items.items().stream().map(item -> new ItemModel(item, uriInfo)).toList());
      page = PageModel.of(pageNumber, pageSize, items.total());
      addSelf(
          ApiTemplates.workspaceInboxItemsPage(
              uriInfo, workspaceId, pageNumber, pageSize, status, sourceKind, query));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      addRelation(
          ApiTemplates.workspaceInboxExtractions(uriInfo, workspaceId), "inbox-extractions");
      if (pageNumber > 1) {
        addRelation(
            ApiTemplates.workspaceInboxItemsPage(
                uriInfo, workspaceId, pageNumber - 1, pageSize, status, sourceKind, query),
            "prev");
      }
      if (pageNumber < page.totalPages()) {
        addRelation(
            ApiTemplates.workspaceInboxItemsPage(
                uriInfo, workspaceId, pageNumber + 1, pageSize, status, sourceKind, query),
            "next");
      }
    }

    private record ItemEmbedded(@JsonProperty("inboxItems") List<ItemModel> inboxItems) {}
  }

  public static final class RevisionCollectionModel extends EvidenceModel<RevisionCollectionModel> {
    @JsonProperty("_embedded")
    private final RevisionEmbedded embedded;

    @JsonProperty private final PageModel page;

    private RevisionCollectionModel(
        String workspaceId,
        String itemId,
        Inbox.Page<Inbox.Revision> revisions,
        int pageNumber,
        int pageSize,
        UriInfo uriInfo) {
      embedded =
          new RevisionEmbedded(
              revisions.items().stream()
                  .map(revision -> new RevisionModel(workspaceId, revision, uriInfo))
                  .toList());
      page = PageModel.of(pageNumber, pageSize, revisions.total());
      addSelf(revisionPage(uriInfo, workspaceId, itemId, pageNumber, pageSize));
      addRelation(ApiTemplates.workspaceInboxItem(uriInfo, workspaceId, itemId), "item");
      if (pageNumber > 1) {
        addRelation(revisionPage(uriInfo, workspaceId, itemId, pageNumber - 1, pageSize), "prev");
      }
      if (pageNumber < page.totalPages()) {
        addRelation(revisionPage(uriInfo, workspaceId, itemId, pageNumber + 1, pageSize), "next");
      }
    }

    private record RevisionEmbedded(
        @JsonProperty("inboxRevisions") List<RevisionModel> inboxRevisions) {}
  }

  private static URI revisionPage(
      UriInfo uriInfo, String workspaceId, String itemId, int page, int pageSize) {
    return UriBuilder.fromUri(ApiTemplates.workspaceInboxRevisions(uriInfo, workspaceId, itemId))
        .queryParam("page", page)
        .queryParam("pageSize", pageSize)
        .build();
  }

  private static String optionalQuery(String value) {
    return value == null || value.trim().isEmpty() ? null : value.trim();
  }
}
