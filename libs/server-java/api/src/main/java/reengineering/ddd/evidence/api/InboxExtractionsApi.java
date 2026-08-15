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
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.InboxModels.CandidateModel;
import reengineering.ddd.evidence.api.InboxModels.ExtractionModel;
import reengineering.ddd.evidence.api.representation.EvidenceModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;

public final class InboxExtractionsApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceService workspaces;

  public InboxExtractionsApi(String actorUserId, String workspaceId, WorkspaceService workspaces) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaces = workspaces;
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_EXTRACTION)
  public Response create(JsonNode input, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(input, "request body is required");
    InboxWorkflow.Extraction extraction =
        workspaces.createInboxExtraction(
            actorUserId,
            workspaceId,
            InboxRequests.stringArray(input.get("inboxItemIds"), "inboxItemIds"));
    return Response.status(Response.Status.CREATED)
        .header(
            "Location",
            ApiTemplates.workspaceInboxExtraction(uriInfo, workspaceId, extraction.getIdentity())
                .getPath())
        .entity(new ExtractionModel(extraction, uriInfo))
        .build();
  }

  @GET
  @Path("{extractionId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_EXTRACTION)
  public ExtractionModel get(
      @PathParam("extractionId") String extractionId, @Context UriInfo uriInfo) {
    return new ExtractionModel(
        workspaces.requireInboxExtraction(actorUserId, workspaceId, extractionId), uriInfo);
  }

  @POST
  @Path("{extractionId}/candidates")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.INBOX_CANDIDATE_SET)
  public Response propose(
      @PathParam("extractionId") String extractionId, JsonNode input, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(input, "request body is required");
    InboxWorkflow.ProposedCandidates result =
        workspaces.proposeInboxCandidates(
            actorUserId,
            workspaceId,
            extractionId,
            InboxRequests.positiveInteger(input.get("expectedVersion"), "expectedVersion"),
            InboxRequests.candidates(input.get("candidates")));
    return Response.status(Response.Status.CREATED)
        .entity(new CandidateSetModel(workspaceId, result, uriInfo))
        .build();
  }

  public static final class CandidateSetModel extends EvidenceModel<CandidateSetModel> {
    @JsonProperty private final ExtractionModel extraction;

    @JsonProperty("_embedded")
    private final CandidateEmbedded embedded;

    private CandidateSetModel(
        String workspaceId, InboxWorkflow.ProposedCandidates result, UriInfo uriInfo) {
      extraction = new ExtractionModel(result.extraction(), uriInfo);
      embedded =
          new CandidateEmbedded(
              result.candidates().stream()
                  .map(candidate -> new CandidateModel(candidate, uriInfo))
                  .toList());
      addRelation(
          ApiTemplates.workspaceInboxExtraction(
              uriInfo, workspaceId, result.extraction().getIdentity()),
          "extraction");
      addRelation(
          ApiTemplates.workspaceExtractionStoryCandidates(
              uriInfo, workspaceId, result.extraction().getIdentity()),
          "story-candidates");
    }

    private record CandidateEmbedded(
        @JsonProperty("storyCandidates") List<CandidateModel> storyCandidates) {}
  }
}
