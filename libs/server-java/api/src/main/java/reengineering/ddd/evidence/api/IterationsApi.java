package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.databind.JsonNode;
import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.InboxModels.IterationModel;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.Clarification;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;
import reengineering.ddd.evidence.domain.model.KickoffProposal;
import reengineering.ddd.evidence.domain.model.NoModelImpact;
import reengineering.ddd.evidence.domain.model.ScenarioProposal;
import reengineering.ddd.evidence.domain.model.Tasking;
import reengineering.ddd.evidence.domain.model.TaskingPlanCandidate;
import reengineering.ddd.evidence.domain.model.Understanding;

public final class IterationsApi {
  private final String actorUserId;
  private final String workspaceId;
  private final WorkspaceService workspaces;

  @Context private ResourceContext resourceContext;

  public IterationsApi(String actorUserId, String workspaceId, WorkspaceService workspaces) {
    this.actorUserId = actorUserId;
    this.workspaceId = workspaceId;
    this.workspaces = workspaces;
  }

  @GET
  @Path("{iterationId}")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.ITERATION)
  public IterationModel get(
      @PathParam("iterationId") String iterationId, @Context UriInfo uriInfo) {
    return new IterationModel(
        workspaces.requireIteration(actorUserId, workspaceId, iterationId), uriInfo);
  }

  @GET
  @Path("{iterationId}/intake")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.ITERATION_INTAKE)
  public IterationModels.IntakeModel intake(
      @PathParam("iterationId") String iterationId, @Context UriInfo uriInfo) {
    return new IterationModels.IntakeModel(
        workspaceId,
        workspaces.requireIterationIntake(actorUserId, workspaceId, iterationId),
        uriInfo);
  }

  @POST
  @Path("{iterationId}/provisioning/complete")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.ITERATION)
  public IterationModel completeProvisioning(
      @PathParam("iterationId") String iterationId, JsonNode body, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(body, "request body is required");
    return new IterationModel(
        workspaces.completeIterationProvisioning(
            actorUserId,
            workspaceId,
            iterationId,
            new IterationWorkflow.CompleteProvisioningInput(
                WorkflowRequests.positive(body.get("expectedVersion"), "expectedVersion"),
                WorkflowRequests.text(body.get("baseCommitSha"), "baseCommitSha"),
                WorkflowRequests.text(body.get("branchName"), "branchName"))),
        uriInfo);
  }

  @POST
  @Path("{iterationId}/provisioning/fail")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.ITERATION)
  public IterationModel failProvisioning(
      @PathParam("iterationId") String iterationId, JsonNode body, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(body, "request body is required");
    return new IterationModel(
        workspaces.failIterationProvisioning(
            actorUserId,
            workspaceId,
            iterationId,
            new IterationWorkflow.FailProvisioningInput(
                WorkflowRequests.positive(body.get("expectedVersion"), "expectedVersion"),
                WorkflowRequests.text(body.get("reason"), "reason"))),
        uriInfo);
  }

  @GET
  @Path("{iterationId}/kickoff")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.KICKOFF)
  public IterationModels.KickoffModel kickoff(
      @PathParam("iterationId") String iterationId, @Context UriInfo uriInfo) {
    return new IterationModels.KickoffModel(
        workspaceId, workspaces.requireKickoff(actorUserId, workspaceId, iterationId), uriInfo);
  }

  @POST
  @Path("{iterationId}/kickoff/proposals")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.KICKOFF_PROPOSAL)
  public Response proposeKickoff(
      @PathParam("iterationId") String iterationId, JsonNode body, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(body, "request body is required");
    KickoffProposal proposal =
        workspaces.proposeKickoffReplacement(
            actorUserId,
            workspaceId,
            iterationId,
            WorkflowRequests.positive(
                body.get("expectedIterationVersion"), "expectedIterationVersion"),
            WorkflowRequests.candidate(body.get("proposal"), "proposal"));
    return Response.status(Response.Status.CREATED)
        .header(
            "Location",
            ApiTemplates.workspaceKickoffProposal(
                    uriInfo, workspaceId, iterationId, proposal.getIdentity())
                .getPath())
        .entity(new IterationModels.KickoffProposalModel(workspaceId, proposal, uriInfo))
        .build();
  }

  @POST
  @Path("{iterationId}/kickoff/decisions")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.KICKOFF_DECISION_RESULT)
  public IterationModels.KickoffDecisionResultModel decideKickoff(
      @PathParam("iterationId") String iterationId, JsonNode body, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(body, "request body is required");
    IterationWorkflow.KickoffDecisionResult result =
        workspaces.decideKickoff(
            actorUserId,
            workspaceId,
            iterationId,
            new IterationWorkflow.KickoffDecisionInput(
                WorkflowRequests.text(body.get("proposalId"), "proposalId"),
                WorkflowRequests.text(body.get("proposalSha256"), "proposalSha256"),
                WorkflowRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                IterationWorkflow.KickoffAction.parse(
                    WorkflowRequests.text(body.get("action"), "action")),
                WorkflowRequests.optional(body.get("reason"), "reason")));
    return new IterationModels.KickoffDecisionResultModel(workspaceId, result, uriInfo);
  }

  @GET
  @Path("{iterationId}/understanding")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.UNDERSTANDING)
  public UnderstandingModels.UnderstandingModel understanding(
      @PathParam("iterationId") String iterationId, @Context UriInfo uriInfo) {
    return new UnderstandingModels.UnderstandingModel(
        workspaceId,
        workspaces.requireUnderstanding(actorUserId, workspaceId, iterationId),
        uriInfo);
  }

  @POST
  @Path("{iterationId}/understanding/clarifications")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.CLARIFICATION)
  public Response askClarification(@PathParam("iterationId") String iterationId, JsonNode body) {
    InboxRequests.requireObject(body, "body must be an object");
    Clarification clarification =
        workspaces.askClarification(
            actorUserId,
            workspaceId,
            iterationId,
            new Understanding.AskInput(
                WorkflowRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                WorkflowRequests.text(body.get("storyId"), "storyId"),
                WorkflowRequests.text(body.get("storyRevisionId"), "storyRevisionId"),
                Understanding.ClarificationTarget.parse(
                    WorkflowRequests.text(body.get("target"), "target")),
                WorkflowRequests.text(body.get("question"), "question")));
    return Response.status(Response.Status.CREATED)
        .entity(new UnderstandingModels.ClarificationModel(clarification))
        .build();
  }

  @POST
  @Path("{iterationId}/understanding/clarifications/{clarificationId}/answer")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.CLARIFICATION_ANSWER_RESULT)
  public UnderstandingModels.AnswerResultModel answerClarification(
      @PathParam("iterationId") String iterationId,
      @PathParam("clarificationId") String clarificationId,
      JsonNode body,
      @Context UriInfo uriInfo) {
    InboxRequests.requireObject(body, "body must be an object");
    return new UnderstandingModels.AnswerResultModel(
        workspaceId,
        workspaces.answerClarification(
            actorUserId,
            workspaceId,
            iterationId,
            new Understanding.AnswerInput(
                WorkflowRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                clarificationId,
                WorkflowRequests.text(body.get("answer"), "answer"))),
        uriInfo);
  }

  @POST
  @Path("{iterationId}/understanding/scenario-proposals")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.SCENARIO_PROPOSAL)
  public Response proposeScenarios(@PathParam("iterationId") String iterationId, JsonNode body) {
    InboxRequests.requireObject(body, "body must be an object");
    ScenarioProposal proposal =
        workspaces.proposeScenarios(
            actorUserId,
            workspaceId,
            iterationId,
            new Understanding.ProposeScenariosInput(
                WorkflowRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                WorkflowRequests.text(body.get("storyId"), "storyId"),
                WorkflowRequests.text(body.get("storyRevisionId"), "storyRevisionId"),
                WorkflowRequests.scenarios(body.get("scenarios"))));
    return Response.status(Response.Status.CREATED)
        .entity(new UnderstandingModels.ScenarioProposalModel(proposal))
        .build();
  }

  @POST
  @Path("{iterationId}/understanding/decisions")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.UNDERSTANDING_DECISION_RESULT)
  public UnderstandingModels.DecisionResultModel decideUnderstanding(
      @PathParam("iterationId") String iterationId, JsonNode body, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(body, "body must be an object");
    List<String> selected =
        body.get("selectedDraftIds") == null
            ? List.of()
            : WorkflowRequests.strings(body.get("selectedDraftIds"), "selectedDraftIds");
    return new UnderstandingModels.DecisionResultModel(
        workspaceId,
        workspaces.decideUnderstanding(
            actorUserId,
            workspaceId,
            iterationId,
            new Understanding.DecideInput(
                WorkflowRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                Understanding.DecisionAction.parse(
                    WorkflowRequests.text(body.get("action"), "action")),
                WorkflowRequests.optional(body.get("proposalId"), "proposalId"),
                WorkflowRequests.optional(body.get("proposalSha256"), "proposalSha256"),
                selected,
                WorkflowRequests.optional(body.get("reason"), "reason"))),
        uriInfo);
  }

  @GET
  @Path("{iterationId}/tasking")
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.TASKING)
  public TaskingModels.TaskingModel tasking(
      @PathParam("iterationId") String iterationId, @Context UriInfo uriInfo) {
    return new TaskingModels.TaskingModel(
        workspaceId, workspaces.requireTasking(actorUserId, workspaceId, iterationId), uriInfo);
  }

  @POST
  @Path("{iterationId}/tasking/no-model-impact")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.NO_MODEL_IMPACT_DECISION)
  public Response noModelImpact(
      @PathParam("iterationId") String iterationId, JsonNode body, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(body, "body must be an object");
    NoModelImpact decision =
        workspaces.recordNoModelImpact(
            actorUserId,
            workspaceId,
            iterationId,
            new Tasking.RecordNoModelImpactInput(
                WorkflowRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                WorkflowRequests.text(body.get("storyId"), "storyId"),
                WorkflowRequests.text(body.get("storyRevisionId"), "storyRevisionId"),
                WorkflowRequests.text(body.get("storyRevisionSha256"), "storyRevisionSha256"),
                WorkflowRequests.text(body.get("reason"), "reason")));
    return Response.status(Response.Status.CREATED)
        .entity(new TaskingModels.NoModelImpactModel(workspaceId, decision, uriInfo))
        .build();
  }

  @POST
  @Path("{iterationId}/tasking/candidates")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.TASKING_CANDIDATE)
  public Response proposeTasking(
      @PathParam("iterationId") String iterationId, JsonNode body, @Context UriInfo uriInfo) {
    TaskingPlanCandidate candidate =
        workspaces.proposeTasking(
            actorUserId, workspaceId, iterationId, WorkflowRequests.tasking(body));
    return Response.status(Response.Status.CREATED)
        .entity(new TaskingModels.CandidateModel(workspaceId, candidate, uriInfo))
        .build();
  }

  @POST
  @Path("{iterationId}/tasking/decisions")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.DESK_CHECK_DECISION_RESULT)
  public TaskingModels.DecisionResultModel decideTasking(
      @PathParam("iterationId") String iterationId, JsonNode body, @Context UriInfo uriInfo) {
    InboxRequests.requireObject(body, "body must be an object");
    return new TaskingModels.DecisionResultModel(
        workspaceId,
        workspaces.decideTasking(
            actorUserId,
            workspaceId,
            iterationId,
            new Tasking.DecideInput(
                WorkflowRequests.positive(
                    body.get("expectedIterationVersion"), "expectedIterationVersion"),
                WorkflowRequests.text(body.get("candidateId"), "candidateId"),
                WorkflowRequests.text(body.get("candidateSha256"), "candidateSha256"),
                Tasking.DeskCheckAction.parse(WorkflowRequests.text(body.get("action"), "action")),
                WorkflowRequests.optional(body.get("reason"), "reason"))),
        uriInfo);
  }

  @Path("{iterationId}/pair")
  public PairApi pair(@PathParam("iterationId") String iterationId) {
    return resourceContext.initResource(
        new PairApi(actorUserId, workspaceId, iterationId, workspaces));
  }

  @Path("{iterationId}/showcase")
  public ShowcaseApi showcase(@PathParam("iterationId") String iterationId) {
    return resourceContext.initResource(
        new ShowcaseApi(actorUserId, workspaceId, iterationId, workspaces));
  }

  @Path("{iterationId}/respond")
  public RespondApi respond(@PathParam("iterationId") String iterationId) {
    return resourceContext.initResource(
        new RespondApi(actorUserId, workspaceId, iterationId, workspaces));
  }
}
