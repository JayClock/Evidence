package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.InboxModels.CandidateModel;
import reengineering.ddd.evidence.api.InboxModels.IterationModel;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.api.representation.PageModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Iteration;

public final class StoryCandidatesApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceService workspaces;

  public StoryCandidatesApi(String actorUserId, String workspaceId, WorkspaceService workspaces) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaces = workspaces;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.STORY_CANDIDATES)
  public CandidateCollectionModel list(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @QueryParam("status") String statusInput,
      @QueryParam("extractionId") String extractionIdInput,
      @QueryParam("q") String queryInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    String statusValue = optionalQuery(statusInput);
    InboxWorkflow.CandidateStatus status =
        statusValue == null ? null : InboxWorkflow.CandidateStatus.parse(statusValue);
    String extractionId = optionalQuery(extractionIdInput);
    String query = optionalQuery(queryInput);
    return new CandidateCollectionModel(
        workspaceId,
        workspaces.inboxCandidates(
            actorUserId,
            workspaceId,
            new InboxWorkflow.CandidateListQuery(page, pageSize, status, extractionId, query)),
        page,
        pageSize,
        statusValue,
        extractionId,
        query,
        uriInfo);
  }

  @GET
  @Path("{candidateId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.STORY_CANDIDATE)
  public CandidateModel get(
      @PathParam("candidateId") String candidateId, @Context UriInfo uriInfo) {
    return new CandidateModel(
        workspaces.requireInboxCandidate(actorUserId, workspaceId, candidateId), uriInfo);
  }

  @POST
  @Path("{candidateId}/defer")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.STORY_CANDIDATE)
  public CandidateModel defer(
      @PathParam("candidateId") String candidateId, JsonNode input, @Context UriInfo uriInfo) {
    return decide(candidateId, input, InboxWorkflow.DecisionAction.DEFER, uriInfo);
  }

  @POST
  @Path("{candidateId}/reject")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.STORY_CANDIDATE)
  public CandidateModel reject(
      @PathParam("candidateId") String candidateId, JsonNode input, @Context UriInfo uriInfo) {
    return decide(candidateId, input, InboxWorkflow.DecisionAction.REJECT, uriInfo);
  }

  @POST
  @Path("{candidateId}/select")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.ITERATION)
  public Response select(
      @PathParam("candidateId") String candidateId, JsonNode input, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(input, "request body is required");
    Iteration iteration =
        workspaces.selectInboxCandidate(
            actorUserId,
            workspaceId,
            new InboxWorkflow.SelectCandidateInput(
                candidateId,
                InboxRequests.requiredString(input.get("candidateSha256"), "candidateSha256"),
                InboxRequests.requiredString(input.get("baseCommitSha"), "baseCommitSha")));
    return Response.status(Response.Status.CREATED)
        .header(
            "Location",
            ApiTemplates.workspaceIteration(uriInfo, workspaceId, iteration.getIdentity())
                .getPath())
        .entity(new IterationModel(iteration, uriInfo))
        .build();
  }

  private CandidateModel decide(
      String candidateId, JsonNode input, InboxWorkflow.DecisionAction action, UriInfo uriInfo) {
    InboxRequests.requireObject(input, "request body is required");
    InboxWorkflow.CandidateDecision result =
        workspaces.decideInboxCandidate(
            actorUserId,
            workspaceId,
            candidateId,
            InboxRequests.requiredString(input.get("candidateSha256"), "candidateSha256"),
            action,
            InboxRequests.requiredString(input.get("reason"), "reason"));
    return new CandidateModel(result.candidate(), uriInfo);
  }

  public static final class CandidateCollectionModel
      extends EvidenceModel<CandidateCollectionModel> {
    @JsonProperty("_embedded")
    private final CandidateEmbedded embedded;

    @JsonProperty private final PageModel page;

    private CandidateCollectionModel(
        String workspaceId,
        InboxWorkflow.CandidatePage candidates,
        int pageNumber,
        int pageSize,
        String status,
        String extractionId,
        String query,
        UriInfo uriInfo) {
      embedded =
          new CandidateEmbedded(
              candidates.items().stream()
                  .map(candidate -> new CandidateModel(candidate, uriInfo))
                  .toList());
      page = PageModel.of(pageNumber, pageSize, candidates.total());
      addSelf(
          ApiTemplates.workspaceStoryCandidatesPage(
              uriInfo, workspaceId, pageNumber, pageSize, status, extractionId, query));
      addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
      if (extractionId != null) {
        addRelation(
            ApiTemplates.workspaceInboxExtraction(uriInfo, workspaceId, extractionId),
            "extraction");
      }
      if (pageNumber > 1) {
        addRelation(
            ApiTemplates.workspaceStoryCandidatesPage(
                uriInfo, workspaceId, pageNumber - 1, pageSize, status, extractionId, query),
            "prev");
      }
      if (pageNumber < page.totalPages()) {
        addRelation(
            ApiTemplates.workspaceStoryCandidatesPage(
                uriInfo, workspaceId, pageNumber + 1, pageSize, status, extractionId, query),
            "next");
      }
    }

    private record CandidateEmbedded(
        @JsonProperty("storyCandidates") List<CandidateModel> storyCandidates) {}
  }

  private static String optionalQuery(String value) {
    return value == null || value.trim().isEmpty() ? null : value.trim();
  }
}
