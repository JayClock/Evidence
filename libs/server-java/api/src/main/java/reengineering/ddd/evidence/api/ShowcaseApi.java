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
import reengineering.ddd.evidence.domain.model.Showcase;

public final class ShowcaseApi {
  private final String actorUserId;
  private final String workspaceId;
  private final String iterationId;
  private final WorkspaceService workspaces;

  public ShowcaseApi(
      String actorUserId, String workspaceId, String iterationId, WorkspaceService workspaces) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.iterationId = iterationId;
    this.workspaces = workspaces;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.SHOWCASE)
  public ShowcaseModels.ViewModel get(@Context UriInfo uriInfo) {
    return new ShowcaseModels.ViewModel(
        workspaceId, workspaces.requireShowcase(actorUserId, workspaceId, iterationId), uriInfo);
  }

  @POST
  @Path("q2-observations")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.SHOWCASE_ACTION_RESULT)
  public Response q2(JsonNode body, @Context UriInfo uriInfo) {
    return created(
        workspaces.recordShowcaseQ2(
            actorUserId, workspaceId, iterationId, ExecutionRequests.q2(body)),
        uriInfo);
  }

  @POST
  @Path("product-observations")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.SHOWCASE_ACTION_RESULT)
  public Response product(JsonNode body, @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Showcase.ActionResult result =
        workspaces.recordShowcaseProduct(
            actorUserId,
            workspaceId,
            iterationId,
            new Showcase.ProductObservationInput(
                ExecutionRequests.positive(
                    body.get("expectedShowcaseVersion"), "expectedShowcaseVersion"),
                ExecutionRequests.text(body.get("scenarioId"), "scenarioId"),
                ExecutionRequests.strings(body.get("observedOutcomes"), "observedOutcomes"),
                ExecutionRequests.text(body.get("observation"), "observation"),
                ExecutionRequests.text(body.get("valueFeedback"), "valueFeedback"),
                ExecutionRequests.strings(body.get("evidenceRefs"), "evidenceRefs")));
    return created(result, uriInfo);
  }

  @POST
  @Path("risk-decisions")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.SHOWCASE_ACTION_RESULT)
  public Response risk(JsonNode body, @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Showcase.ActionResult result =
        workspaces.recordShowcaseRisk(
            actorUserId,
            workspaceId,
            iterationId,
            new Showcase.RiskDecisionInput(
                ExecutionRequests.positive(
                    body.get("expectedShowcaseVersion"), "expectedShowcaseVersion"),
                ExecutionRequests.text(body.get("quadrant"), "quadrant"),
                ExecutionRequests.text(body.get("disposition"), "disposition"),
                ExecutionRequests.strings(body.get("activities"), "activities"),
                ExecutionRequests.text(body.get("reason"), "reason")));
    return created(result, uriInfo);
  }

  @POST
  @Path("evaluations")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.SHOWCASE_ACTION_RESULT)
  public Response evaluation(JsonNode body, @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Showcase.ActionResult result =
        workspaces.recordShowcaseEvaluation(
            actorUserId,
            workspaceId,
            iterationId,
            new Showcase.EvaluationInput(
                ExecutionRequests.positive(
                    body.get("expectedShowcaseVersion"), "expectedShowcaseVersion"),
                ExecutionRequests.text(body.get("quadrant"), "quadrant"),
                ExecutionRequests.text(body.get("activity"), "activity"),
                ExecutionRequests.text(body.get("outcome"), "outcome"),
                ExecutionRequests.text(body.get("finding"), "finding"),
                ExecutionRequests.strings(body.get("evidenceRefs"), "evidenceRefs")));
    return created(result, uriInfo);
  }

  @POST
  @Path("reviews")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.SHOWCASE_ACTION_RESULT)
  public Response review(JsonNode body, @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Showcase.ActionResult result =
        workspaces.recordShowcaseReview(
            actorUserId,
            workspaceId,
            iterationId,
            new Showcase.ReviewInput(
                ExecutionRequests.positive(
                    body.get("expectedShowcaseVersion"), "expectedShowcaseVersion"),
                ExecutionRequests.text(body.get("evidenceBundleSha256"), "evidenceBundleSha256"),
                ExecutionRequests.strings(body.get("observedFacts"), "observedFacts"),
                ExecutionRequests.strings(
                    body.get("productDomainFeedback"), "productDomainFeedback"),
                ExecutionRequests.strings(
                    body.get("technicalQualityFeedback"), "technicalQualityFeedback"),
                ExecutionRequests.strings(
                    body.get("unresolvedAssumptions"), "unresolvedAssumptions"),
                ExecutionRequests.text(body.get("recommendation"), "recommendation")));
    return created(result, uriInfo);
  }

  @POST
  @Path("decisions")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.SHOWCASE_ACTION_RESULT)
  public ShowcaseModels.ActionResultModel decide(JsonNode body, @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Showcase.ActionResult result =
        workspaces.decideShowcase(
            actorUserId,
            workspaceId,
            iterationId,
            new Showcase.DecideInput(
                ExecutionRequests.positive(
                    body.get("expectedShowcaseVersion"), "expectedShowcaseVersion"),
                ExecutionRequests.text(body.get("action"), "action"),
                ExecutionRequests.text(body.get("reason"), "reason"),
                ExecutionRequests.optional(
                    body.get("evidenceBundleSha256"), "evidenceBundleSha256"),
                ExecutionRequests.optional(body.get("reviewSha256"), "reviewSha256"),
                ExecutionRequests.optional(body.get("feedbackTarget"), "feedbackTarget")));
    return new ShowcaseModels.ActionResultModel(workspaceId, result, uriInfo);
  }

  private Response created(Showcase.ActionResult result, UriInfo uriInfo) {
    return Response.status(Response.Status.CREATED)
        .entity(new ShowcaseModels.ActionResultModel(workspaceId, result, uriInfo))
        .build();
  }
}
