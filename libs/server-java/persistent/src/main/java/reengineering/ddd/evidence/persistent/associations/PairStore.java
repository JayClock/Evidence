package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.core.Ref;
import jakarta.inject.Inject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.ApprovedTaskingPlanDescription;
import reengineering.ddd.evidence.domain.description.StoryRevisionDescription;
import reengineering.ddd.evidence.domain.description.TaskingPlanCandidateDescription;
import reengineering.ddd.evidence.domain.model.ApprovedTaskingPlan;
import reengineering.ddd.evidence.domain.model.Delivery;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.domain.model.Pair;
import reengineering.ddd.evidence.domain.model.Story;
import reengineering.ddd.evidence.domain.model.StoryRevision;
import reengineering.ddd.evidence.domain.model.Tasking;
import reengineering.ddd.evidence.persistent.mappers.ExecutionMapper;
import reengineering.ddd.evidence.persistent.mappers.ExecutionRows;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;
import reengineering.ddd.evidence.persistent.mappers.WorkflowMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkflowRows;

@Component
final class PairStore {
  private static final TypeReference<List<String>> STRINGS = new TypeReference<>() {};
  private static final long LEASE_MINUTES = 10;

  @Inject private ExecutionMapper mapper;
  @Inject private WorkflowMapper workflow;
  @Inject private ObjectMapper objectMapper;
  @Inject private Clock clock;

  Pair.StartResult start(String workspaceId, String iterationId, Pair.StartInput rawInput) {
    Pair.StartInput input = Pair.normalize(rawInput);
    InboxRows.IterationRow iteration = requireIteration(workspaceId, iterationId);
    if (!"active".equals(iteration.lifecycle())
        || !"tasking".equals(iteration.loop())
        || !"approved".equals(iteration.stage())
        || iteration.branchName() == null) {
      throw DomainException.conflict(
          "Iteration " + iterationId + " is not at the approved Pair entry");
    }
    ApprovedTaskingPlan approved = approvedPlan(workspaceId, iterationId);
    if (!approved.getIdentity().equals(input.approvedTaskingPlanId())) {
      throw DomainException.notFound(
          "Approved Tasking Plan " + input.approvedTaskingPlanId() + " not found");
    }
    if (!approved.getDescription().contentSha256().equals(input.approvedTaskingPlanSha256())) {
      throw DomainException.conflict("Approved Tasking Plan content has changed");
    }
    Pair.materializeExecutionPlan(approved.getDescription().plan());
    Story story = story(workspaceId, approved.getDescription().story().id());
    StoryRevision revision =
        storyRevision(
            workspaceId,
            approved.getDescription().story().id(),
            approved.getDescription().storyRevision().id());
    if (!story.getDescription().latestRevision().id().equals(revision.getIdentity())
        || !revision
            .getDescription()
            .contentSha256()
            .equals(approved.getDescription().plan().storyRevisionSha256())) {
      throw DomainException.conflict("Approved Tasking Plan Story Revision is no longer current");
    }
    if (mapper.countOpenPairs(workspaceId) > 0) {
      throw DomainException.conflict("Workspace " + workspaceId + " already has an open Pair Run");
    }
    Instant timestamp = timestamp();
    claimIteration(
        iteration, input.expectedIterationVersion(), "active", "pair", "plan_confirmed", timestamp);
    int sequence = mapper.countPairRuns(workspaceId) + 1;
    String leaseToken = randomToken();
    ExecutionRows.PairRunRow row =
        new ExecutionRows.PairRunRow(
            UUID.randomUUID().toString(),
            "PAIR-" + String.format("%04d", sequence),
            workspaceId,
            iterationId,
            approved.getDescription().story().id(),
            revision.getIdentity(),
            revision.getDescription().contentSha256(),
            approved.getIdentity(),
            approved.getDescription().contentSha256(),
            approved.getDescription().plan().baseCommitSha(),
            iteration.branchName(),
            "running",
            "plan_confirmed",
            1,
            write(initialCursor()),
            write(List.of()),
            write(List.of()),
            write(approved.getDescription().plan().executionBudget()),
            write(initialUsage()),
            input.executorId(),
            rawSha256(leaseToken),
            timestamp.plus(LEASE_MINUTES, ChronoUnit.MINUTES),
            null,
            null,
            null,
            timestamp,
            timestamp,
            null);
    mapper.insertPairRun(row);
    return new Pair.StartResult(load(workspaceId, row), leaseToken);
  }

  Pair.ClaimLeaseResult claimLease(
      String workspaceId, String iterationId, Pair.ClaimLeaseInput rawInput) {
    Pair.ClaimLeaseInput input = Pair.normalize(rawInput);
    ExecutionRows.PairRunRow run = requireRun(workspaceId, iterationId, input.pairRunId());
    Instant timestamp = timestamp();
    if (run.version() != input.expectedPairVersion()
        || !"running".equals(run.status())
        || (run.leaseExpiresAt() != null && run.leaseExpiresAt().isAfter(timestamp))) {
      throw DomainException.conflict("Pair Run cannot grant a new lease");
    }
    String token = randomToken();
    Instant expires = timestamp.plus(LEASE_MINUTES, ChronoUnit.MINUTES);
    if (mapper.claimPairLease(
            run.id(), run.version(), input.executorId(), rawSha256(token), expires, timestamp)
        != 1) {
      throw DomainException.conflict("Pair lease changed; reload before claiming");
    }
    ExecutionRows.PairRunRow claimed =
        copyRun(
            run,
            run.status(),
            run.checkpoint(),
            run.version(),
            run.cursor(),
            run.completedTestIds(),
            run.completedStepKeys(),
            run.budgetUsage(),
            input.executorId(),
            rawSha256(token),
            expires,
            run.currentDiffSha256(),
            run.finalManifestSha256(),
            run.approvedCommitSha(),
            timestamp,
            run.completedAt());
    return new Pair.ClaimLeaseResult(pairRun(claimed), token);
  }

  Pair.Run heartbeat(String workspaceId, String iterationId, Pair.HeartbeatLeaseInput rawInput) {
    Pair.HeartbeatLeaseInput input = Pair.normalize(rawInput);
    ExecutionRows.PairRunRow run = requireRun(workspaceId, iterationId, input.pairRunId());
    Instant timestamp = timestamp();
    requireLease(run, input.expectedPairVersion(), input.leaseToken(), timestamp);
    Instant expires = timestamp.plus(LEASE_MINUTES, ChronoUnit.MINUTES);
    if (mapper.heartbeatPairLease(
            run.id(), run.version(), rawSha256(input.leaseToken()), expires, timestamp)
        != 1) {
      throw DomainException.conflict("Pair lease changed; reload before running");
    }
    return pairRun(
        copyRun(
            run,
            run.status(),
            run.checkpoint(),
            run.version(),
            run.cursor(),
            run.completedTestIds(),
            run.completedStepKeys(),
            run.budgetUsage(),
            run.leaseOwnerId(),
            run.leaseTokenSha256(),
            expires,
            run.currentDiffSha256(),
            run.finalManifestSha256(),
            run.approvedCommitSha(),
            timestamp,
            run.completedAt()));
  }

  Pair.ActionResult recordDriver(
      String workspaceId, String iterationId, Pair.DriverAttemptInput rawInput) {
    Pair.DriverAttemptInput input = Pair.normalize(rawInput);
    ExecutionRows.PairDriverAttemptRow duplicate =
        mapper.findPairDriverAttemptByAction(
            input.authority().pairRunId(), input.authority().actionId());
    if (duplicate != null) return actionResult(workspaceId, iterationId, duplicate.id());
    Context context = requireAction(workspaceId, iterationId, input.authority());
    Map<String, Object> action = requireActionKind(context.view(), "run_driver");
    if (!Objects.equals(action.get("role"), input.role())
        || !Objects.equals(action.get("mode"), input.mode())) {
      throw DomainException.conflict("Pair Driver role no longer matches");
    }
    validateDriverPaths(input, action);
    Pair.WorkUnit unit = (Pair.WorkUnit) action.get("workUnit");
    Instant timestamp = timestamp();
    int sequence = context.view().driverAttempts().size() + 1;
    Map<String, Object> content =
        Pair.map(
            "pairRunId", context.run().id(),
            "actionId", input.authority().actionId(),
            "sequence", sequence,
            "role", input.role(),
            "mode", input.mode(),
            "taskId", unit == null ? null : unit.task().id(),
            "testId", unit == null ? null : unit.test().id(),
            "processId", unit == null ? null : unit.process().processId(),
            "stepId", unit == null ? null : unit.step().id(),
            "summary", input.summary(),
            "changedPaths", input.changedPaths(),
            "beforeWorktreeSha256", input.beforeWorktreeSha256(),
            "afterWorktreeSha256", input.afterWorktreeSha256(),
            "diffSha256", input.diffSha256(),
            "agentCallCount", input.agentCallCount(),
            "inputTokens", input.inputTokens(),
            "outputTokens", input.outputTokens(),
            "completedAt", CanonicalJson.instant(timestamp));
    ExecutionRows.PairDriverAttemptRow row =
        new ExecutionRows.PairDriverAttemptRow(
            UUID.randomUUID().toString(),
            context.run().id(),
            input.authority().actionId(),
            sequence,
            input.role(),
            input.mode(),
            unit == null ? null : unit.task().id(),
            unit == null ? null : unit.test().id(),
            unit == null ? null : unit.process().processId(),
            unit == null ? null : unit.step().id(),
            input.summary(),
            write(input.changedPaths()),
            input.beforeWorktreeSha256(),
            input.afterWorktreeSha256(),
            input.diffSha256(),
            input.agentCallCount(),
            input.inputTokens(),
            input.outputTokens(),
            timestamp,
            CanonicalJson.hash(content));
    mapper.insertPairDriverAttempt(row);
    State state = new State(context.run());
    state.checkpoint =
        "repair_quality_gate".equals(input.mode())
            ? "refactored"
            : "test".equals(input.role())
                ? "test_written"
                : "production".equals(input.role()) ? "implementation_written" : "refactored";
    state.currentDiffSha256 = input.diffSha256();
    state.budgetUsage = incrementUsage(state.budgetUsage, input.agentCallCount());
    state.cursor = clearRepair(state.cursor);
    advance(context, state, null, state.checkpoint, "active", timestamp);
    return actionResult(workspaceId, iterationId, row.id());
  }

  Pair.ActionResult recordCommand(
      String workspaceId, String iterationId, Pair.CommandObservationInput rawInput) {
    Pair.CommandObservationInput input = Pair.normalize(rawInput);
    ExecutionRows.PairCommandObservationRow duplicate =
        mapper.findPairCommandObservationByAction(
            input.authority().pairRunId(), input.authority().actionId());
    if (duplicate != null) return actionResult(workspaceId, iterationId, duplicate.id());
    Context context = requireAction(workspaceId, iterationId, input.authority());
    Map<String, Object> action = requireActionKind(context.view(), "execute_command");
    if (!Objects.equals(action.get("stage"), input.stage())
        || !Objects.equals(action.get("command"), input.command())) {
      throw DomainException.conflict("Pair command authority no longer matches");
    }
    Pair.WorkUnit unit = (Pair.WorkUnit) action.get("workUnit");
    Pair.QualityGate gate = (Pair.QualityGate) action.get("gate");
    String processId = unit == null ? gate.processId() : unit.process().processId();
    Instant timestamp = timestamp();
    List<Pair.CommandObservation> prior = context.view().commandObservations();
    int sequence = prior.size() + 1;
    boolean passed = Pair.commandPassed(input);
    String failureFingerprint =
        passed && !"red".equals(input.stage())
            ? null
            : CanonicalJson.hash(
                Pair.map(
                    "stage", input.stage(),
                    "command", input.command(),
                    "termination", input.termination(),
                    "exitCode", input.exitCode(),
                    "signal", input.signal(),
                    "stdoutSha256", input.stdoutSha256(),
                    "stderrSha256", input.stderrSha256()));
    String previousHash = prior.isEmpty() ? null : prior.get(prior.size() - 1).recordSha256();
    Map<String, Object> content =
        Pair.map(
            "pairRunId", context.run().id(),
            "actionId", input.authority().actionId(),
            "sequence", sequence,
            "stage", input.stage(),
            "taskId", unit == null ? null : unit.task().id(),
            "testId", unit == null ? null : unit.test().id(),
            "processId", processId,
            "stepId", unit == null ? null : unit.step().id(),
            "command", input.command(),
            "termination", input.termination(),
            "exitCode", input.exitCode(),
            "signal", input.signal(),
            "durationMs", input.durationMs(),
            "stdoutSha256", input.stdoutSha256(),
            "stdoutBytes", input.stdoutBytes(),
            "stdoutLines", input.stdoutLines(),
            "stderrSha256", input.stderrSha256(),
            "stderrBytes", input.stderrBytes(),
            "stderrLines", input.stderrLines(),
            "worktreeSha256", input.worktreeSha256(),
            "diffSha256", input.diffSha256(),
            "failureFingerprint", failureFingerprint,
            "observedAt", CanonicalJson.instant(timestamp),
            "previousRecordSha256", previousHash);
    ExecutionRows.PairCommandObservationRow row =
        new ExecutionRows.PairCommandObservationRow(
            UUID.randomUUID().toString(),
            context.run().id(),
            input.authority().actionId(),
            sequence,
            input.stage(),
            unit == null ? null : unit.task().id(),
            unit == null ? null : unit.test().id(),
            processId,
            unit == null ? null : unit.step().id(),
            input.command(),
            input.termination(),
            input.exitCode(),
            input.signal(),
            input.durationMs(),
            input.stdoutSha256(),
            input.stdoutBytes(),
            input.stdoutLines(),
            input.stderrSha256(),
            input.stderrBytes(),
            input.stderrLines(),
            input.worktreeSha256(),
            input.diffSha256(),
            failureFingerprint,
            timestamp,
            previousHash,
            CanonicalJson.hash(content));
    mapper.insertPairCommandObservation(row);
    State state = new State(context.run());
    state.budgetUsage = incrementUsage(state.budgetUsage, 0);
    if ("red".equals(input.stage())) {
      if (passed) {
        exception(
            context,
            state,
            input.authority().actionId(),
            "unexpected_green",
            "The newly written TEST passed before Production changed.",
            failureFingerprint,
            timestamp);
      } else if (!"exited".equals(input.termination()) || input.exitCode() == null) {
        exception(
            context,
            state,
            input.authority().actionId(),
            "pseudo_red",
            "Red command terminated as " + input.termination() + ".",
            failureFingerprint,
            timestamp);
      } else {
        state.checkpoint = "test_written";
        state.currentDiffSha256 = input.diffSha256();
        advance(context, state, null, state.checkpoint, "active", timestamp);
      }
    } else if (!passed) {
      String kind =
          "green".equals(input.stage())
              ? "green_failed"
              : "refactor".equals(input.stage()) ? "refactor_failed" : "quality_gate_failed";
      exception(
          context,
          state,
          input.authority().actionId(),
          kind,
          input.stage() + " command did not pass.",
          failureFingerprint,
          timestamp);
    } else {
      commandPassed(context, state, action, input, row, timestamp);
    }
    return actionResult(workspaceId, iterationId, row.id());
  }

  Pair.ActionResult recordRedReview(
      String workspaceId, String iterationId, Pair.RedReviewInput rawInput) {
    Pair.RedReviewInput input = Pair.normalize(rawInput);
    ExecutionRows.PairRedReviewRow duplicate =
        mapper.findPairRedReviewByAction(
            input.authority().pairRunId(), input.authority().actionId());
    if (duplicate != null) return actionResult(workspaceId, iterationId, duplicate.id());
    Context context = requireAction(workspaceId, iterationId, input.authority());
    Map<String, Object> action = requireActionKind(context.view(), "review_red");
    if (!Objects.equals(action.get("observationId"), input.observationId())) {
      throw DomainException.conflict("Red observation authority has changed");
    }
    Pair.CommandObservation observation =
        context.view().commandObservations().stream()
            .filter(
                candidate ->
                    candidate.id().equals(input.observationId()) && "red".equals(candidate.stage()))
            .findFirst()
            .orElseThrow(
                () -> DomainException.conflict("Red Review requires one failing Red observation"));
    if ("exited".equals(observation.termination())
        && Integer.valueOf(0).equals(observation.exitCode())) {
      throw DomainException.conflict("Red Review requires one failing Red observation");
    }
    Instant timestamp = timestamp();
    boolean accepted = "behavior".equals(input.classification());
    Map<String, Object> content =
        Pair.map(
            "pairRunId", context.run().id(),
            "actionId", input.authority().actionId(),
            "observationId", input.observationId(),
            "classification", input.classification(),
            "accepted", accepted,
            "reason", input.reason(),
            "reviewedAt", CanonicalJson.instant(timestamp));
    ExecutionRows.PairRedReviewRow row =
        new ExecutionRows.PairRedReviewRow(
            UUID.randomUUID().toString(),
            context.run().id(),
            input.authority().actionId(),
            input.observationId(),
            input.classification(),
            accepted,
            input.reason(),
            timestamp,
            CanonicalJson.hash(content));
    mapper.insertPairRedReview(row);
    State state = new State(context.run());
    state.budgetUsage = incrementUsage(state.budgetUsage, 1);
    if (accepted) {
      state.checkpoint = "red_observed";
      advance(context, state, null, state.checkpoint, "active", timestamp);
    } else {
      exception(
          context,
          state,
          input.authority().actionId(),
          "pseudo_red",
          "Red Reviewer classified the failure as " + input.classification() + ".",
          observation.failureFingerprint(),
          timestamp);
    }
    return actionResult(workspaceId, iterationId, row.id());
  }

  Pair.ActionResult recordException(
      String workspaceId, String iterationId, Pair.ExceptionInput rawInput) {
    Pair.ExceptionInput input = Pair.normalize(rawInput);
    ExecutionRows.PairExceptionRow duplicate =
        mapper.findPairExceptionByAction(
            input.authority().pairRunId(), input.authority().actionId());
    if (duplicate != null) return actionResult(workspaceId, iterationId, duplicate.id());
    Context context = requireAction(workspaceId, iterationId, input.authority());
    State state = new State(context.run());
    Instant timestamp = timestamp();
    exception(
        context,
        state,
        input.authority().actionId(),
        input.kind(),
        input.summary(),
        input.failureFingerprint(),
        timestamp);
    ExecutionRows.PairExceptionRow created = mapper.findCurrentPairException(context.run().id());
    return actionResult(workspaceId, iterationId, created.id());
  }

  Pair.ActionResult decide(
      String workspaceId, String iterationId, Pair.DecideInput rawInput, String actorUserId) {
    Pair.DecideInput input = Pair.normalize(rawInput);
    ExecutionRows.PairRunRow run = requireRun(workspaceId, iterationId, null);
    if (run.version() != input.expectedPairVersion()) {
      if (run.version() == input.expectedPairVersion() + 1) {
        Pair.Decision replay =
            load(workspaceId, run).decisions().stream()
                .filter(
                    decision ->
                        decision.action().equals(input.action())
                            && decision.reason().equals(input.reason())
                            && Objects.equals(decision.manifestSha256(), input.manifestSha256())
                            && Objects.equals(decision.diffSha256(), input.diffSha256())
                            && Objects.equals(decision.commitSha(), input.commitSha())
                            && decision.decidedByUserId().equals(actorUserId))
                .findFirst()
                .orElse(null);
        if (replay != null) return actionResult(workspaceId, iterationId, replay.id());
      }
      throw DomainException.conflict("Pair changed; reload before deciding");
    }
    Pair.View view = load(workspaceId, run);
    requireHumanAction(view, input.action());
    if ("approve".equals(input.action())) {
      if (view.manifest() == null
          || !Objects.equals(input.manifestSha256(), view.manifest().contentSha256())
          || !Objects.equals(input.diffSha256(), view.manifest().finalDiffSha256())
          || !Objects.equals(run.finalManifestSha256(), view.manifest().contentSha256())) {
        throw DomainException.conflict("Pair approval evidence no longer matches the Manifest");
      }
    }
    Instant timestamp = timestamp();
    String decisionId = UUID.randomUUID().toString();
    int sequence = view.decisions().size() + 1;
    Map<String, Object> content =
        Pair.map(
            "pairRunId", run.id(),
            "sequence", sequence,
            "action", input.action(),
            "reason", input.reason(),
            "manifestSha256", input.manifestSha256(),
            "diffSha256", input.diffSha256(),
            "commitSha", input.commitSha(),
            "decidedByUserId", actorUserId,
            "decidedAt", CanonicalJson.instant(timestamp));
    ExecutionRows.PairDecisionRow decision =
        new ExecutionRows.PairDecisionRow(
            decisionId,
            run.id(),
            sequence,
            input.action(),
            input.reason(),
            input.manifestSha256(),
            input.diffSha256(),
            input.commitSha(),
            actorUserId,
            timestamp,
            CanonicalJson.hash(content));
    mapper.insertPairDecision(decision);
    Context context = new Context(run, view, requireIteration(workspaceId, iterationId));
    State state = new State(run);
    state.leaseOwnerId = null;
    state.leaseTokenSha256 = null;
    state.leaseExpiresAt = null;
    String loop = "pair";
    String stage;
    String lifecycle = "active";
    switch (input.action()) {
      case "approve" -> {
        state.status = "approved";
        state.checkpoint = "approved";
        state.approvedCommitSha = input.commitSha();
        state.completedAt = timestamp;
        loop = "showcase";
        stage = "setup";
      }
      case "retry_quality" -> {
        Pair.CommandObservation failed = repairObservation(view);
        state.status = "running";
        state.checkpoint = "refactored";
        state.cursor =
            new Pair.Cursor(
                state.cursor.unitIndex(),
                null,
                0,
                0,
                "repair_quality_gate",
                failed == null ? state.cursor.repairDiagnosticObservationId() : failed.id(),
                null,
                null);
        state.finalManifestSha256 = null;
        state.completedAt = null;
        stage = "refactored";
      }
      case "back_implementation" -> {
        Pair.ExecutionPlan execution =
            Pair.materializeExecutionPlan(view.approvedPlan().getDescription().plan());
        Pair.CommandObservation failed = repairObservation(view);
        int index =
            failed == null
                ? Math.min(state.cursor.unitIndex(), execution.workUnits().size() - 1)
                : indexOfTest(execution, failed.testId());
        if (index < 0) index = Math.max(execution.workUnits().size() - 1, 0);
        Pair.WorkUnit unit = execution.workUnits().get(index);
        state.status = "running";
        state.checkpoint = "red_observed";
        state.cursor =
            new Pair.Cursor(
                index,
                null,
                0,
                0,
                "repair_implementation",
                failed == null ? null : failed.id(),
                decisionId,
                input.reason());
        state.completedTestIds =
            state.completedTestIds.stream().filter(id -> !id.equals(unit.test().id())).toList();
        state.completedStepKeys =
            state.completedStepKeys.stream().filter(key -> !key.equals(unit.stepKey())).toList();
        state.finalManifestSha256 = null;
        state.completedAt = null;
        stage = "red_observed";
      }
      case "back_test" -> {
        state.status = "running";
        state.checkpoint = "plan_confirmed";
        state.cursor =
            new Pair.Cursor(
                Math.min(
                    state.cursor.unitIndex(),
                    Math.max(
                        Pair.materializeExecutionPlan(view.approvedPlan().getDescription().plan())
                                .workUnits()
                                .size()
                            - 1,
                        0)),
                null,
                0,
                0,
                "repair_test",
                repairObservation(view) == null ? null : repairObservation(view).id(),
                decisionId,
                input.reason());
        state.completedAt = null;
        stage = "plan_confirmed";
      }
      case "back_tasking" -> {
        state.status = "cancelled";
        state.checkpoint = "exception";
        state.completedAt = timestamp;
        loop = "tasking";
        stage = "knowledge_gap";
      }
      case "cancel" -> {
        state.status = "cancelled";
        state.checkpoint = "exception";
        state.completedAt = timestamp;
        stage = "exception";
        lifecycle = "halted";
      }
      default -> throw DomainException.internal("Unsupported Pair decision transition");
    }
    advance(context, state, loop, stage, lifecycle, timestamp);
    mapper.resolvePairExceptions(run.id(), timestamp);
    if ("approve".equals(input.action())) {
      openShowcase(workspaceId, iterationId, state, view.manifest(), timestamp);
    }
    return actionResult(workspaceId, iterationId, decisionId);
  }

  Pair.View find(String workspaceId, String iterationId) {
    ExecutionRows.PairRunRow row = mapper.findLatestPair(workspaceId, iterationId);
    return row == null ? null : load(workspaceId, row);
  }

  Pair.View load(String workspaceId, ExecutionRows.PairRunRow row) {
    Iteration iteration = iteration(requireIteration(workspaceId, row.iterationId()));
    Story story = story(workspaceId, row.storyId());
    StoryRevision revision = storyRevision(workspaceId, row.storyId(), row.storyRevisionId());
    ApprovedTaskingPlan plan = approvedPlan(workspaceId, row.iterationId());
    Pair.Run run = pairRun(row);
    List<Pair.DriverAttempt> attempts =
        mapper.findPairDriverAttempts(row.id()).stream().map(this::driverAttempt).toList();
    List<Pair.CommandObservation> commands =
        mapper.findPairCommandObservations(row.id()).stream()
            .map(this::commandObservation)
            .toList();
    List<Pair.RedReview> reviews =
        mapper.findPairRedReviews(row.id()).stream().map(this::redReview).toList();
    ExecutionRows.PairExceptionRow exceptionRow = mapper.findCurrentPairException(row.id());
    Pair.AutomationException exception = exceptionRow == null ? null : pairException(exceptionRow);
    ExecutionRows.PairManifestRow manifestRow = mapper.findLatestPairManifest(row.id());
    Pair.Manifest manifest =
        manifestRow != null
                && Objects.equals(manifestRow.contentSha256(), row.finalManifestSha256())
            ? manifest(manifestRow)
            : null;
    List<Pair.Decision> decisions =
        mapper.findPairDecisions(row.id()).stream().map(this::pairDecision).toList();
    Pair.View base =
        new Pair.View(
            iteration, story, revision, plan, run, attempts, commands, reviews, exception, manifest,
            decisions, null);
    return new Pair.View(
        iteration,
        story,
        revision,
        plan,
        run,
        attempts,
        commands,
        reviews,
        exception,
        manifest,
        decisions,
        Pair.nextAction(base));
  }

  Pair.Run pairRun(ExecutionRows.PairRunRow row) {
    return new Pair.Run(
        row.id(),
        row.reference(),
        row.workspaceId(),
        row.iterationId(),
        row.storyId(),
        row.storyRevisionId(),
        row.storyRevisionSha256(),
        row.approvedTaskingPlanId(),
        row.approvedTaskingPlanSha256(),
        row.baseCommitSha(),
        row.branchName(),
        row.status(),
        row.checkpoint(),
        row.version(),
        read(row.cursor(), Pair.Cursor.class),
        strings(row.completedTestIds()),
        strings(row.completedStepKeys()),
        read(row.executionBudget(), Tasking.ExecutionBudget.class),
        read(row.budgetUsage(), Pair.BudgetUsage.class),
        row.leaseOwnerId(),
        instant(row.leaseExpiresAt()),
        row.currentDiffSha256(),
        row.finalManifestSha256(),
        row.approvedCommitSha(),
        CanonicalJson.instant(row.startedAt()),
        CanonicalJson.instant(row.updatedAt()),
        instant(row.completedAt()));
  }

  Pair.Manifest manifest(ExecutionRows.PairManifestRow row) {
    return new Pair.Manifest(
        row.id(),
        row.pairRunId(),
        row.approvedTaskingPlanSha256(),
        row.storyRevisionSha256(),
        row.baseCommitSha(),
        strings(row.completedTestIds()),
        strings(row.completedStepKeys()),
        strings(row.driverAttemptIds()),
        strings(row.commandObservationIds()),
        strings(row.redReviewIds()),
        strings(row.changedPaths()),
        row.finalDiffSha256(),
        row.evidenceChainSha256(),
        CanonicalJson.instant(row.generatedAt()),
        row.contentSha256());
  }

  ApprovedTaskingPlan approvedPlan(String workspaceId, String iterationId) {
    WorkflowRows.ApprovedPlanRow row = workflow.findApprovedPlan(workspaceId, iterationId);
    if (row == null) throw DomainException.notFound("Approved Tasking Plan not found");
    StoredApprovedPayload payload = read(row.payload(), StoredApprovedPayload.class);
    TaskingPlanCandidateDescription plan =
        new TaskingPlanCandidateDescription(
            payload.planVersion(),
            payload.reference(),
            new Ref<>(row.iterationId()),
            new Ref<>(row.storyId()),
            new Ref<>(row.storyRevisionId()),
            payload.storyRevisionSha256(),
            payload.baseCommitSha(),
            new Ref<>(payload.noModelImpactDecisionId()),
            payload.noModelImpactDecisionSha256(),
            payload.sequence(),
            payload.projectCatalog(),
            payload.projectCatalogSha256(),
            payload.tests(),
            payload.tasks(),
            payload.processes(),
            payload.executionBudget(),
            payload.candidateContentSha256(),
            Instant.parse(payload.proposedAt()));
    return new ApprovedTaskingPlan(
        row.id(),
        new ApprovedTaskingPlanDescription(
            new Ref<>(row.iterationId()),
            new Ref<>(row.storyId()),
            new Ref<>(row.storyRevisionId()),
            new Ref<>(row.taskingCandidateId()),
            new Ref<>(row.deskCheckDecisionId()),
            plan,
            row.contentSha256(),
            new Ref<>(row.approvedByUserId()),
            row.approvedAt()));
  }

  Iteration iteration(InboxRows.IterationRow row) {
    return IterationEntities.iteration(
        row, new IterationIntakeAssociation(row.id(), workflow, objectMapper));
  }

  Story story(String workspaceId, String storyId) {
    WorkflowRows.StoryRow row = workflow.findStory(workspaceId, storyId);
    if (row == null) throw DomainException.notFound("Story " + storyId + " not found");
    return StoryEntities.story(row, new StoryRevisions(row.id(), workflow, objectMapper));
  }

  StoryRevision storyRevision(String workspaceId, String storyId, String revisionId) {
    WorkflowRows.StoryRevisionRow row =
        workflow.findStoryRevision(workspaceId, storyId, revisionId);
    if (row == null) throw DomainException.notFound("Story Revision " + revisionId + " not found");
    List<Delivery.Citation> citations =
        workflow.findStoryCitations(row.id()).stream()
            .map(
                value ->
                    new Delivery.Citation(
                        new Ref<>(value.inboxItemId()),
                        new Ref<>(value.inboxRevisionId()),
                        value.inboxRevisionNumber(),
                        value.contentSha256(),
                        value.locator()))
            .toList();
    List<Delivery.Scenario> scenarios =
        workflow.findStoryScenarios(row.id()).stream()
            .map(
                value ->
                    new Delivery.Scenario(
                        value.id(),
                        value.reference(),
                        value.sourceDraftId(),
                        value.title(),
                        strings(value.givenSteps()),
                        value.whenStep(),
                        strings(value.thenSteps()),
                        strings(value.businessData())))
            .toList();
    return new StoryRevision(
        row.id(),
        new StoryRevisionDescription(
            new Ref<>(row.storyId()),
            row.revisionNumber(),
            row.title(),
            row.problem(),
            row.role(),
            row.goal(),
            row.value(),
            InboxWorkflow.CognitiveMode.parseStored(row.cognitiveMode()),
            citations,
            scenarios,
            row.contentSha256(),
            new Ref<>(row.createdByUserId()),
            row.createdAt()));
  }

  InboxRows.IterationRow requireIteration(String workspaceId, String iterationId) {
    InboxRows.IterationRow row = workflow.findIteration(workspaceId, iterationId);
    if (row == null) throw DomainException.notFound("Iteration " + iterationId + " not found");
    return row;
  }

  void claimIteration(
      InboxRows.IterationRow current,
      int expectedVersion,
      String lifecycle,
      String loop,
      String stage,
      Instant timestamp) {
    if (workflow.claimIteration(
            current.workspaceId(),
            current.id(),
            expectedVersion,
            current.loop(),
            List.of(current.stage()),
            lifecycle,
            loop,
            stage,
            timestamp)
        != 1) {
      throw DomainException.conflict(
          "Iteration changed; reload before recording execution evidence");
    }
  }

  String write(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Could not encode execution authority");
    }
  }

  <T> T read(String json, Class<T> type) {
    try {
      return objectMapper.readValue(json, type);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Stored execution authority is invalid");
    }
  }

  List<String> strings(String json) {
    try {
      return objectMapper.readValue(json, STRINGS);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Stored execution string list is invalid");
    }
  }

  Instant timestamp() {
    return clock.instant().truncatedTo(ChronoUnit.MILLIS);
  }

  private Context requireAction(
      String workspaceId, String iterationId, Pair.ActionAuthority authority) {
    ExecutionRows.PairRunRow run = requireRun(workspaceId, iterationId, authority.pairRunId());
    Instant timestamp = timestamp();
    requireLease(run, authority.expectedPairVersion(), authority.leaseToken(), timestamp);
    Pair.View view = load(workspaceId, run);
    if (view.nextAction() == null
        || !Objects.equals(view.nextAction().get("actionId"), authority.actionId())) {
      throw DomainException.conflict("Pair action authority has changed");
    }
    return new Context(run, view, requireIteration(workspaceId, iterationId));
  }

  private void requireLease(
      ExecutionRows.PairRunRow run, int expectedVersion, String token, Instant timestamp) {
    if (run.version() != expectedVersion
        || !"running".equals(run.status())
        || run.leaseTokenSha256() == null
        || !run.leaseTokenSha256().equals(rawSha256(token))
        || run.leaseExpiresAt() == null
        || !run.leaseExpiresAt().isAfter(timestamp)) {
      throw DomainException.conflict("Pair lease changed or expired");
    }
  }

  private ExecutionRows.PairRunRow requireRun(
      String workspaceId, String iterationId, String pairRunId) {
    ExecutionRows.PairRunRow run = mapper.findLatestPair(workspaceId, iterationId);
    if (run == null || (pairRunId != null && !run.id().equals(pairRunId))) {
      throw DomainException.notFound("Pair " + iterationId + " not found");
    }
    return run;
  }

  private Map<String, Object> requireActionKind(Pair.View view, String kind) {
    if (view.nextAction() == null || !kind.equals(view.nextAction().get("kind"))) {
      throw DomainException.conflict("Pair action no longer permits " + kind);
    }
    return view.nextAction();
  }

  @SuppressWarnings("unchecked")
  private void validateDriverPaths(Pair.DriverAttemptInput input, Map<String, Object> action) {
    List<String> testRoots = (List<String>) action.get("allowedTestRoots");
    List<String> productionRoots = (List<String>) action.get("allowedProductionRoots");
    List<String> frozen = (List<String>) action.get("frozenTestPaths");
    List<String> roots = "test".equals(input.role()) ? testRoots : productionRoots;
    for (String path : input.changedPaths()) {
      if (roots.stream().noneMatch(root -> owns(root, path))) {
        throw DomainException.conflict("Pair Driver changed a path outside its approved roots");
      }
      if (!"test".equals(input.role()) && frozen.contains(path)) {
        throw DomainException.conflict("Pair Driver changed a frozen TEST path");
      }
    }
  }

  private void commandPassed(
      Context context,
      State state,
      Map<String, Object> action,
      Pair.CommandObservationInput input,
      ExecutionRows.PairCommandObservationRow observation,
      Instant timestamp) {
    Pair.ExecutionPlan execution =
        Pair.materializeExecutionPlan(context.view().approvedPlan().getDescription().plan());
    if ("green".equals(input.stage())) {
      Pair.WorkUnit unit = (Pair.WorkUnit) action.get("workUnit");
      state.completedTestIds = unique(state.completedTestIds, unit.test().id());
      int nextIndex = state.cursor.unitIndex() + 1;
      Pair.WorkUnit next =
          nextIndex < execution.workUnits().size() ? execution.workUnits().get(nextIndex) : null;
      boolean leavesStep = next == null || !next.stepKey().equals(unit.stepKey());
      state.checkpoint = leavesStep ? "green_observed" : "plan_confirmed";
      state.cursor =
          new Pair.Cursor(
              nextIndex,
              leavesStep ? unit.stepKey() : null,
              0,
              state.cursor.qualityGateIndex(),
              state.cursor.repairMode(),
              state.cursor.repairDiagnosticObservationId(),
              state.cursor.repairDecisionId(),
              state.cursor.repairInstruction());
      state.completedTestIds = unique(state.completedTestIds, unit.test().id());
      state.currentDiffSha256 = input.diffSha256();
      advance(context, state, null, state.checkpoint, "active", timestamp);
      return;
    }
    if ("refactor".equals(input.stage())) {
      String stepKey = state.cursor.pendingRefactorStepKey();
      List<Pair.WorkUnit> units =
          execution.workUnits().stream().filter(unit -> unit.stepKey().equals(stepKey)).toList();
      int nextVerification = state.cursor.refactorVerificationIndex() + 1;
      if (nextVerification < units.size()) {
        state.cursor =
            new Pair.Cursor(
                state.cursor.unitIndex(),
                stepKey,
                nextVerification,
                state.cursor.qualityGateIndex(),
                state.cursor.repairMode(),
                state.cursor.repairDiagnosticObservationId(),
                state.cursor.repairDecisionId(),
                state.cursor.repairInstruction());
      } else {
        state.cursor =
            new Pair.Cursor(
                state.cursor.unitIndex(),
                null,
                0,
                0,
                state.cursor.repairMode(),
                state.cursor.repairDiagnosticObservationId(),
                state.cursor.repairDecisionId(),
                state.cursor.repairInstruction());
        state.completedStepKeys = unique(state.completedStepKeys, stepKey);
      }
      state.checkpoint = "refactored";
      state.currentDiffSha256 = input.diffSha256();
      advance(context, state, null, state.checkpoint, "active", timestamp);
      return;
    }
    int nextGate = state.cursor.qualityGateIndex() + 1;
    if (nextGate < execution.qualityGates().size()) {
      state.cursor =
          new Pair.Cursor(
              state.cursor.unitIndex(),
              state.cursor.pendingRefactorStepKey(),
              state.cursor.refactorVerificationIndex(),
              nextGate,
              state.cursor.repairMode(),
              state.cursor.repairDiagnosticObservationId(),
              state.cursor.repairDecisionId(),
              state.cursor.repairInstruction());
      state.checkpoint = "refactored";
      state.currentDiffSha256 = input.diffSha256();
      advance(context, state, null, state.checkpoint, "active", timestamp);
      return;
    }
    Pair.Manifest manifest =
        createManifest(context, state, input.diffSha256(), observation, timestamp);
    state.status = "approval_required";
    state.checkpoint = "quality_gates_passed";
    state.currentDiffSha256 = input.diffSha256();
    state.finalManifestSha256 = manifest.contentSha256();
    state.leaseOwnerId = null;
    state.leaseTokenSha256 = null;
    state.leaseExpiresAt = null;
    advance(context, state, null, state.checkpoint, "active", timestamp);
  }

  private Pair.Manifest createManifest(
      Context context,
      State state,
      String finalDiffSha256,
      ExecutionRows.PairCommandObservationRow current,
      Instant timestamp) {
    List<ExecutionRows.PairDriverAttemptRow> attempts =
        mapper.findPairDriverAttempts(context.run().id());
    List<ExecutionRows.PairCommandObservationRow> commands =
        new ArrayList<>(mapper.findPairCommandObservations(context.run().id()));
    if (commands.stream().noneMatch(row -> row.id().equals(current.id()))) commands.add(current);
    List<ExecutionRows.PairRedReviewRow> reviews = mapper.findPairRedReviews(context.run().id());
    List<String> changedPaths =
        attempts.stream()
            .flatMap(row -> strings(row.changedPaths()).stream())
            .distinct()
            .sorted()
            .toList();
    List<Map<String, Object>> chain = new ArrayList<>();
    attempts.forEach(
        row ->
            chain.add(
                Pair.map("kind", "driver", "id", row.id(), "recordSha256", row.recordSha256())));
    commands.forEach(
        row ->
            chain.add(
                Pair.map("kind", "command", "id", row.id(), "recordSha256", row.recordSha256())));
    reviews.forEach(
        row ->
            chain.add(
                Pair.map(
                    "kind", "red-review", "id", row.id(), "recordSha256", row.recordSha256())));
    String chainHash = CanonicalJson.hash(chain);
    Map<String, Object> content =
        Pair.map(
            "pairRunId", context.run().id(),
            "approvedTaskingPlanSha256", context.run().approvedTaskingPlanSha256(),
            "storyRevisionSha256", context.run().storyRevisionSha256(),
            "baseCommitSha", context.run().baseCommitSha(),
            "completedTestIds", state.completedTestIds,
            "completedStepKeys", state.completedStepKeys,
            "driverAttemptIds",
                attempts.stream().map(ExecutionRows.PairDriverAttemptRow::id).toList(),
            "commandObservationIds",
                commands.stream().map(ExecutionRows.PairCommandObservationRow::id).toList(),
            "redReviewIds", reviews.stream().map(ExecutionRows.PairRedReviewRow::id).toList(),
            "changedPaths", changedPaths,
            "finalDiffSha256", finalDiffSha256,
            "evidenceChainSha256", chainHash,
            "generatedAt", CanonicalJson.instant(timestamp));
    ExecutionRows.PairManifestRow row =
        new ExecutionRows.PairManifestRow(
            UUID.randomUUID().toString(),
            context.run().id(),
            context.run().approvedTaskingPlanSha256(),
            context.run().storyRevisionSha256(),
            context.run().baseCommitSha(),
            write(state.completedTestIds),
            write(state.completedStepKeys),
            write(attempts.stream().map(ExecutionRows.PairDriverAttemptRow::id).toList()),
            write(commands.stream().map(ExecutionRows.PairCommandObservationRow::id).toList()),
            write(reviews.stream().map(ExecutionRows.PairRedReviewRow::id).toList()),
            write(changedPaths),
            finalDiffSha256,
            chainHash,
            timestamp,
            CanonicalJson.hash(content));
    mapper.insertPairManifest(row);
    return manifest(row);
  }

  private void exception(
      Context context,
      State state,
      String actionId,
      String kind,
      String summary,
      String fingerprint,
      Instant timestamp) {
    List<String> routes = Pair.allowedExceptionRoutes(kind);
    Map<String, Object> content =
        Pair.map(
            "pairRunId", context.run().id(),
            "actionId", actionId,
            "kind", kind,
            "summary", summary,
            "failureFingerprint", fingerprint,
            "allowedRoutes", routes,
            "raisedAt", CanonicalJson.instant(timestamp),
            "resolvedAt", null);
    mapper.insertPairException(
        new ExecutionRows.PairExceptionRow(
            UUID.randomUUID().toString(),
            context.run().id(),
            actionId,
            kind,
            summary,
            fingerprint,
            write(routes),
            timestamp,
            null,
            CanonicalJson.hash(content)));
    state.status = "exception";
    state.checkpoint = "exception";
    state.leaseOwnerId = null;
    state.leaseTokenSha256 = null;
    state.leaseExpiresAt = null;
    advance(context, state, null, "exception", "active", timestamp);
  }

  private void advance(
      Context context,
      State state,
      String loop,
      String stage,
      String lifecycle,
      Instant timestamp) {
    if ("running".equals(state.status) && state.leaseTokenSha256 != null) {
      state.leaseExpiresAt = timestamp.plus(LEASE_MINUTES, ChronoUnit.MINUTES);
    } else if (!"running".equals(state.status)) {
      state.leaseExpiresAt = null;
    }
    ExecutionRows.PairRunRow updated =
        state.row(context.run(), context.run().version() + 1, timestamp);
    if (mapper.updatePairRun(updated, context.run().version()) != 1) {
      throw DomainException.conflict("Pair changed; reload before recording evidence");
    }
    InboxRows.IterationRow iteration = context.iteration();
    claimIteration(
        iteration, iteration.version(), lifecycle, loop == null ? "pair" : loop, stage, timestamp);
  }

  private void openShowcase(
      String workspaceId,
      String iterationId,
      State state,
      Pair.Manifest manifest,
      Instant timestamp) {
    if (manifest == null || state.approvedCommitSha == null) {
      throw DomainException.internal("Approved Pair lost its Manifest or commit authority");
    }
    ExecutionRows.PairRunRow pair = mapper.findLatestPair(workspaceId, iterationId);
    int attempt = mapper.countIterationShowcases(iterationId) + 1;
    int sequence = mapper.countShowcaseRuns(workspaceId) + 1;
    mapper.insertShowcaseRun(
        new ExecutionRows.ShowcaseRunRow(
            UUID.randomUUID().toString(),
            "SHOW-" + String.format("%04d", sequence),
            attempt,
            workspaceId,
            iterationId,
            pair.storyId(),
            pair.storyRevisionId(),
            pair.storyRevisionSha256(),
            pair.approvedTaskingPlanId(),
            pair.approvedTaskingPlanSha256(),
            pair.id(),
            manifest.id(),
            manifest.contentSha256(),
            state.approvedCommitSha,
            "setup",
            1,
            null,
            timestamp,
            timestamp,
            null));
  }

  private void requireHumanAction(Pair.View view, String action) {
    if ("approval_required".equals(view.run().status())) {
      if (!Set.of("approve", "back_implementation", "back_tasking", "cancel").contains(action)) {
        throw DomainException.conflict("Pair approval does not permit " + action);
      }
      return;
    }
    if (!"exception".equals(view.run().status())
        || view.currentException() == null
        || !view.currentException().allowedRoutes().contains(action)) {
      throw DomainException.conflict("Pair is not awaiting this human decision");
    }
  }

  private Pair.CommandObservation repairObservation(Pair.View view) {
    if (view.currentException() == null || view.currentException().actionId() == null) return null;
    return view.commandObservations().stream()
        .filter(candidate -> candidate.actionId().equals(view.currentException().actionId()))
        .findFirst()
        .orElse(null);
  }

  private int indexOfTest(Pair.ExecutionPlan execution, String testId) {
    if (testId == null) return -1;
    for (int index = 0; index < execution.workUnits().size(); index++) {
      if (execution.workUnits().get(index).test().id().equals(testId)) return index;
    }
    return -1;
  }

  private Pair.ActionResult actionResult(
      String workspaceId, String iterationId, String acceptedRecordId) {
    ExecutionRows.PairRunRow run = requireRun(workspaceId, iterationId, null);
    return new Pair.ActionResult(load(workspaceId, run), acceptedRecordId);
  }

  private Pair.DriverAttempt driverAttempt(ExecutionRows.PairDriverAttemptRow row) {
    return new Pair.DriverAttempt(
        row.id(),
        row.pairRunId(),
        row.actionId(),
        row.sequence(),
        row.role(),
        row.mode(),
        row.taskId(),
        row.testId(),
        row.processId(),
        row.stepId(),
        row.summary(),
        strings(row.changedPaths()),
        row.beforeWorktreeSha256(),
        row.afterWorktreeSha256(),
        row.diffSha256(),
        row.agentCallCount(),
        row.inputTokens(),
        row.outputTokens(),
        CanonicalJson.instant(row.completedAt()),
        row.recordSha256());
  }

  private Pair.CommandObservation commandObservation(ExecutionRows.PairCommandObservationRow row) {
    return new Pair.CommandObservation(
        row.id(),
        row.pairRunId(),
        row.actionId(),
        row.sequence(),
        row.stage(),
        row.taskId(),
        row.testId(),
        row.processId(),
        row.stepId(),
        row.command(),
        row.termination(),
        row.exitCode(),
        row.signal(),
        row.durationMs(),
        row.stdoutSha256(),
        row.stdoutBytes(),
        row.stdoutLines(),
        row.stderrSha256(),
        row.stderrBytes(),
        row.stderrLines(),
        row.worktreeSha256(),
        row.diffSha256(),
        row.failureFingerprint(),
        CanonicalJson.instant(row.observedAt()),
        row.previousRecordSha256(),
        row.recordSha256());
  }

  private Pair.RedReview redReview(ExecutionRows.PairRedReviewRow row) {
    return new Pair.RedReview(
        row.id(),
        row.pairRunId(),
        row.actionId(),
        row.observationId(),
        row.classification(),
        row.accepted(),
        row.reason(),
        CanonicalJson.instant(row.reviewedAt()),
        row.recordSha256());
  }

  private Pair.AutomationException pairException(ExecutionRows.PairExceptionRow row) {
    return new Pair.AutomationException(
        row.id(),
        row.pairRunId(),
        row.actionId(),
        row.kind(),
        row.summary(),
        row.failureFingerprint(),
        strings(row.allowedRoutes()),
        CanonicalJson.instant(row.raisedAt()),
        instant(row.resolvedAt()),
        row.recordSha256());
  }

  private Pair.Decision pairDecision(ExecutionRows.PairDecisionRow row) {
    return new Pair.Decision(
        row.id(),
        row.pairRunId(),
        row.action(),
        row.reason(),
        row.manifestSha256(),
        row.diffSha256(),
        row.commitSha(),
        row.decidedByUserId(),
        CanonicalJson.instant(row.decidedAt()),
        row.contentSha256());
  }

  private static Pair.Cursor initialCursor() {
    return new Pair.Cursor(0, null, 0, 0, null, null, null, null);
  }

  private static Pair.BudgetUsage initialUsage() {
    return new Pair.BudgetUsage(0, 0, 0, 0);
  }

  private static Pair.BudgetUsage incrementUsage(Pair.BudgetUsage usage, int calls) {
    return new Pair.BudgetUsage(
        usage.agentCalls() + calls,
        usage.checkpoints() + 1,
        usage.repeatedFingerprintCount(),
        usage.noProgressCheckpoints());
  }

  private static Pair.Cursor clearRepair(Pair.Cursor cursor) {
    return new Pair.Cursor(
        cursor.unitIndex(),
        cursor.pendingRefactorStepKey(),
        cursor.refactorVerificationIndex(),
        cursor.qualityGateIndex(),
        null,
        null,
        null,
        null);
  }

  private static List<String> unique(List<String> values, String value) {
    LinkedHashSet<String> result = new LinkedHashSet<>(values);
    result.add(value);
    return List.copyOf(result);
  }

  private static boolean owns(String root, String path) {
    String normalizedRoot = root.replace('\\', '/').replaceAll("/+$", "");
    return path.equals(normalizedRoot) || path.startsWith(normalizedRoot + "/");
  }

  private static String randomToken() {
    byte[] bytes = new byte[32];
    new java.security.SecureRandom().nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private static String rawSha256(String value) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return "sha256:" + java.util.HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException(error);
    }
  }

  private static String instant(Instant value) {
    return value == null ? null : CanonicalJson.instant(value);
  }

  private static ExecutionRows.PairRunRow copyRun(
      ExecutionRows.PairRunRow row,
      String status,
      String checkpoint,
      int version,
      String cursor,
      String completedTests,
      String completedSteps,
      String budgetUsage,
      String leaseOwner,
      String leaseHash,
      Instant leaseExpires,
      String currentDiff,
      String finalManifest,
      String approvedCommit,
      Instant updatedAt,
      Instant completedAt) {
    return new ExecutionRows.PairRunRow(
        row.id(),
        row.reference(),
        row.workspaceId(),
        row.iterationId(),
        row.storyId(),
        row.storyRevisionId(),
        row.storyRevisionSha256(),
        row.approvedTaskingPlanId(),
        row.approvedTaskingPlanSha256(),
        row.baseCommitSha(),
        row.branchName(),
        status,
        checkpoint,
        version,
        cursor,
        completedTests,
        completedSteps,
        row.executionBudget(),
        budgetUsage,
        leaseOwner,
        leaseHash,
        leaseExpires,
        currentDiff,
        finalManifest,
        approvedCommit,
        row.startedAt(),
        updatedAt,
        completedAt);
  }

  private record Context(
      ExecutionRows.PairRunRow run, Pair.View view, InboxRows.IterationRow iteration) {}

  private final class State {
    private String status;
    private String checkpoint;
    private Pair.Cursor cursor;
    private List<String> completedTestIds;
    private List<String> completedStepKeys;
    private Pair.BudgetUsage budgetUsage;
    private String leaseOwnerId;
    private String leaseTokenSha256;
    private Instant leaseExpiresAt;
    private String currentDiffSha256;
    private String finalManifestSha256;
    private String approvedCommitSha;
    private Instant completedAt;

    private State(ExecutionRows.PairRunRow row) {
      status = row.status();
      checkpoint = row.checkpoint();
      cursor = read(row.cursor(), Pair.Cursor.class);
      completedTestIds = strings(row.completedTestIds());
      completedStepKeys = strings(row.completedStepKeys());
      budgetUsage = read(row.budgetUsage(), Pair.BudgetUsage.class);
      leaseOwnerId = row.leaseOwnerId();
      leaseTokenSha256 = row.leaseTokenSha256();
      leaseExpiresAt = row.leaseExpiresAt();
      currentDiffSha256 = row.currentDiffSha256();
      finalManifestSha256 = row.finalManifestSha256();
      approvedCommitSha = row.approvedCommitSha();
      completedAt = row.completedAt();
    }

    private ExecutionRows.PairRunRow row(
        ExecutionRows.PairRunRow original, int version, Instant timestamp) {
      return copyRun(
          original,
          status,
          checkpoint,
          version,
          write(cursor),
          write(completedTestIds),
          write(completedStepKeys),
          write(budgetUsage),
          leaseOwnerId,
          leaseTokenSha256,
          leaseExpiresAt,
          currentDiffSha256,
          finalManifestSha256,
          approvedCommitSha,
          timestamp,
          completedAt);
    }
  }

  private record StoredApprovedPayload(
      String reference,
      String storyRevisionSha256,
      String baseCommitSha,
      String noModelImpactDecisionId,
      String noModelImpactDecisionSha256,
      int sequence,
      String projectCatalogSha256,
      int planVersion,
      Tasking.ProjectCatalog projectCatalog,
      List<Tasking.TestDescription> tests,
      List<Tasking.TaskDescription> tasks,
      List<Tasking.ProcessSelection> processes,
      Tasking.ExecutionBudget executionBudget,
      String candidateContentSha256,
      String proposedAt) {}
}
