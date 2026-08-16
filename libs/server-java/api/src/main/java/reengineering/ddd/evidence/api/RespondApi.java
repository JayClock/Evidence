package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.databind.JsonNode;
import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.Respond;

public final class RespondApi {
  private final String actorUserId;
  private final String workspaceId;
  private final String iterationId;
  private final WorkspaceService workspaces;

  public RespondApi(
      String actorUserId, String workspaceId, String iterationId, WorkspaceService workspaces) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.iterationId = iterationId;
    this.workspaces = workspaces;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.RESPOND)
  public RespondModels.ViewModel get(@Context UriInfo uriInfo) {
    return new RespondModels.ViewModel(
        workspaceId, workspaces.requireRespond(actorUserId, workspaceId, iterationId), uriInfo);
  }

  @POST
  @Path("candidates")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.RESPOND_ACTION_RESULT)
  public Response candidate(JsonNode body, @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Respond.ActionResult result =
        workspaces.proposeRespondCandidate(
            actorUserId,
            workspaceId,
            iterationId,
            new Respond.ProposeInput(
                ExecutionRequests.text(body.get("actionId"), "actionId"),
                ExecutionRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                ExecutionRequests.text(body.get("authoritySha256"), "authoritySha256"),
                ExecutionRequests.promotions(body.get("promotions")),
                ExecutionRequests.optional(body.get("noPromotionReason"), "noPromotionReason"),
                ExecutionRequests.strings(body.get("observedOutcomes"), "observedOutcomes"),
                ExecutionRequests.strings(body.get("residualRisks"), "residualRisks"),
                ExecutionRequests.probe(body.get("nextProbe"))));
    return Response.status(Response.Status.CREATED)
        .entity(new RespondModels.ActionResultModel(workspaceId, result, uriInfo))
        .build();
  }

  @POST
  @Path("decisions")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.RESPOND_ACTION_RESULT)
  public RespondModels.ActionResultModel decide(JsonNode body, @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Respond.ActionResult result =
        workspaces.decideRespond(
            actorUserId,
            workspaceId,
            iterationId,
            new Respond.DecideInput(
                ExecutionRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                ExecutionRequests.text(body.get("candidateId"), "candidateId"),
                ExecutionRequests.text(body.get("candidateSha256"), "candidateSha256"),
                ExecutionRequests.text(body.get("authoritySha256"), "authoritySha256"),
                ExecutionRequests.text(body.get("action"), "action"),
                ExecutionRequests.text(body.get("reason"), "reason")));
    return new RespondModels.ActionResultModel(workspaceId, result, uriInfo);
  }
}
