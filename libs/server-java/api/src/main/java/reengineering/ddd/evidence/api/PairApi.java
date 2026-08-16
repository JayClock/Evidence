package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.databind.JsonNode;
import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.Pair;

public final class PairApi {
  private final String actorUserId;
  private final String workspaceId;
  private final String iterationId;
  private final WorkspaceService workspaces;

  public PairApi(
      String actorUserId, String workspaceId, String iterationId, WorkspaceService workspaces) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.iterationId = iterationId;
    this.workspaces = workspaces;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.PAIR)
  public PairModels.ViewModel get(@Context UriInfo uriInfo) {
    return new PairModels.ViewModel(
        workspaceId, workspaces.requirePair(actorUserId, workspaceId, iterationId), uriInfo);
  }

  @POST
  @Path("runs")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.PAIR_START_RESULT)
  public Response start(JsonNode body, @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Pair.StartResult result =
        workspaces.startPair(
            actorUserId,
            workspaceId,
            iterationId,
            new Pair.StartInput(
                ExecutionRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                ExecutionRequests.text(body.get("approvedTaskingPlanId"), "approvedTaskingPlanId"),
                ExecutionRequests.text(
                    body.get("approvedTaskingPlanSha256"), "approvedTaskingPlanSha256"),
                ExecutionRequests.text(body.get("executorId"), "executorId")));
    return Response.status(Response.Status.CREATED)
        .entity(new PairModels.StartResultModel(workspaceId, result, uriInfo))
        .build();
  }

  @POST
  @Path("lease/claim")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.PAIR_ACTION_RESULT)
  public PairModels.ClaimLeaseResultModel claim(JsonNode body) {
    ExecutionRequests.object(body);
    return new PairModels.ClaimLeaseResultModel(
        workspaces.claimPairLease(
            actorUserId,
            workspaceId,
            iterationId,
            new Pair.ClaimLeaseInput(
                ExecutionRequests.text(body.get("pairRunId"), "pairRunId"),
                ExecutionRequests.positive(body.get("expectedPairVersion"), "expectedPairVersion"),
                ExecutionRequests.text(body.get("executorId"), "executorId"))));
  }

  @POST
  @Path("lease/heartbeat")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.PAIR_ACTION_RESULT)
  public Pair.Run heartbeat(
      JsonNode body, @HeaderParam("X-Evidence-Pair-Lease") String leaseToken) {
    ExecutionRequests.object(body);
    return workspaces.heartbeatPairLease(
        actorUserId,
        workspaceId,
        iterationId,
        new Pair.HeartbeatLeaseInput(
            ExecutionRequests.text(body.get("pairRunId"), "pairRunId"),
            ExecutionRequests.positive(body.get("expectedPairVersion"), "expectedPairVersion"),
            leaseToken));
  }

  @POST
  @Path("driver-attempts")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.PAIR_ACTION_RESULT)
  public Response driver(
      JsonNode body,
      @HeaderParam("X-Evidence-Pair-Lease") String leaseToken,
      @Context UriInfo uriInfo) {
    Pair.ActionResult result =
        workspaces.recordPairDriverAttempt(
            actorUserId, workspaceId, iterationId, ExecutionRequests.driver(body, leaseToken));
    return created(result, uriInfo);
  }

  @POST
  @Path("command-observations")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.PAIR_ACTION_RESULT)
  public Response command(
      JsonNode body,
      @HeaderParam("X-Evidence-Pair-Lease") String leaseToken,
      @Context UriInfo uriInfo) {
    Pair.ActionResult result =
        workspaces.recordPairCommandObservation(
            actorUserId, workspaceId, iterationId, ExecutionRequests.command(body, leaseToken));
    return created(result, uriInfo);
  }

  @POST
  @Path("red-reviews")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.PAIR_ACTION_RESULT)
  public Response redReview(
      JsonNode body,
      @HeaderParam("X-Evidence-Pair-Lease") String leaseToken,
      @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Pair.ActionResult result =
        workspaces.recordPairRedReview(
            actorUserId,
            workspaceId,
            iterationId,
            new Pair.RedReviewInput(
                ExecutionRequests.pairAuthority(body, leaseToken),
                ExecutionRequests.text(body.get("observationId"), "observationId"),
                ExecutionRequests.text(body.get("classification"), "classification"),
                ExecutionRequests.text(body.get("reason"), "reason")));
    return created(result, uriInfo);
  }

  @POST
  @Path("exceptions")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.PAIR_ACTION_RESULT)
  public Response exception(
      JsonNode body,
      @HeaderParam("X-Evidence-Pair-Lease") String leaseToken,
      @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Pair.ActionResult result =
        workspaces.recordPairException(
            actorUserId,
            workspaceId,
            iterationId,
            new Pair.ExceptionInput(
                ExecutionRequests.pairAuthority(body, leaseToken),
                ExecutionRequests.text(body.get("kind"), "kind"),
                ExecutionRequests.text(body.get("summary"), "summary"),
                ExecutionRequests.optional(body.get("failureFingerprint"), "failureFingerprint")));
    return created(result, uriInfo);
  }

  @POST
  @Path("decisions")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.PAIR_ACTION_RESULT)
  public PairModels.ActionResultModel decide(JsonNode body, @Context UriInfo uriInfo) {
    ExecutionRequests.object(body);
    Pair.ActionResult result =
        workspaces.decidePair(
            actorUserId,
            workspaceId,
            iterationId,
            new Pair.DecideInput(
                ExecutionRequests.positive(body.get("expectedPairVersion"), "expectedPairVersion"),
                ExecutionRequests.text(body.get("action"), "action"),
                ExecutionRequests.text(body.get("reason"), "reason"),
                ExecutionRequests.optional(body.get("manifestSha256"), "manifestSha256"),
                ExecutionRequests.optional(body.get("diffSha256"), "diffSha256"),
                ExecutionRequests.optional(body.get("commitSha"), "commitSha")));
    return new PairModels.ActionResultModel(workspaceId, result, uriInfo);
  }

  private Response created(Pair.ActionResult result, UriInfo uriInfo) {
    return Response.status(Response.Status.CREATED)
        .entity(new PairModels.ActionResultModel(workspaceId, result, uriInfo))
        .build();
  }
}
