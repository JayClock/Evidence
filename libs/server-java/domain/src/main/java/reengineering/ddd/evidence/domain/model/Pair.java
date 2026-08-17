package reengineering.ddd.evidence.domain.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.TaskingPlanCandidateDescription;

/** Pair execution authority and immutable evidence projections. */
public final class Pair {
  private static final Pattern SHA256 = Pattern.compile("^sha256:[a-f0-9]{64}$");
  private static final Pattern GIT_SHA = Pattern.compile("^[a-f0-9]{40,64}$");
  private static final Pattern IDENTIFIER = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$");
  private static final Pattern RELATIVE_PATH =
      Pattern.compile("^(?!/)(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$))[^\\x00]+$");

  private Pair() {}

  public record Cursor(
      int unitIndex,
      String pendingRefactorStepKey,
      int refactorVerificationIndex,
      int qualityGateIndex,
      String repairMode,
      String repairDiagnosticObservationId,
      String repairDecisionId,
      String repairInstruction) {}

  public record BudgetUsage(
      int agentCalls, int checkpoints, int repeatedFingerprintCount, int noProgressCheckpoints) {}

  public record Run(
      String id,
      String reference,
      String workspaceId,
      String iterationId,
      String storyId,
      String storyRevisionId,
      String storyRevisionSha256,
      String approvedTaskingPlanId,
      String approvedTaskingPlanSha256,
      String baseCommitSha,
      String branchName,
      String status,
      String checkpoint,
      int version,
      Cursor cursor,
      List<String> completedTestIds,
      List<String> completedStepKeys,
      Tasking.ExecutionBudget executionBudget,
      BudgetUsage budgetUsage,
      String leaseOwnerId,
      String leaseExpiresAt,
      String currentDiffSha256,
      String finalManifestSha256,
      String approvedCommitSha,
      String startedAt,
      String updatedAt,
      String completedAt) {
    public Run {
      completedTestIds = List.copyOf(completedTestIds);
      completedStepKeys = List.copyOf(completedStepKeys);
    }
  }

  public record WorkUnit(
      int index,
      String stepKey,
      Tasking.TaskDescription task,
      Tasking.TestDescription test,
      Tasking.ProcessSelection process,
      TaskingCatalog.ProcessStep step,
      Tasking.MaterializedCommand focusedCommand,
      List<String> testRoots,
      List<String> productionRoots) {
    public WorkUnit {
      testRoots = List.copyOf(testRoots);
      productionRoots = List.copyOf(productionRoots);
    }
  }

  public record QualityGate(
      int index, String processId, String projectId, String target, String command) {}

  public record ExecutionPlan(List<WorkUnit> workUnits, List<QualityGate> qualityGates) {
    public ExecutionPlan {
      workUnits = List.copyOf(workUnits);
      qualityGates = List.copyOf(qualityGates);
    }
  }

  public record DriverAttempt(
      String id,
      String pairRunId,
      String actionId,
      int sequence,
      String role,
      String mode,
      String taskId,
      String testId,
      String processId,
      String stepId,
      String summary,
      List<String> changedPaths,
      String beforeWorktreeSha256,
      String afterWorktreeSha256,
      String diffSha256,
      int agentCallCount,
      Integer inputTokens,
      Integer outputTokens,
      String completedAt,
      String recordSha256) {
    public DriverAttempt {
      changedPaths = List.copyOf(changedPaths);
    }
  }

  public record CommandObservation(
      String id,
      String pairRunId,
      String actionId,
      int sequence,
      String stage,
      String taskId,
      String testId,
      String processId,
      String stepId,
      String command,
      String termination,
      Integer exitCode,
      String signal,
      int durationMs,
      String stdoutSha256,
      int stdoutBytes,
      int stdoutLines,
      String stderrSha256,
      int stderrBytes,
      int stderrLines,
      String worktreeSha256,
      String diffSha256,
      String failureFingerprint,
      String observedAt,
      String previousRecordSha256,
      String recordSha256) {}

  public record RedReview(
      String id,
      String pairRunId,
      String actionId,
      String observationId,
      String classification,
      boolean accepted,
      String reason,
      String reviewedAt,
      String recordSha256) {}

  public record AutomationException(
      String id,
      String pairRunId,
      String actionId,
      String kind,
      String summary,
      String failureFingerprint,
      List<String> allowedRoutes,
      String raisedAt,
      String resolvedAt,
      String recordSha256) {
    public AutomationException {
      allowedRoutes = List.copyOf(allowedRoutes);
    }
  }

  public record Manifest(
      String id,
      String pairRunId,
      String approvedTaskingPlanSha256,
      String storyRevisionSha256,
      String baseCommitSha,
      List<String> completedTestIds,
      List<String> completedStepKeys,
      List<String> driverAttemptIds,
      List<String> commandObservationIds,
      List<String> redReviewIds,
      List<String> changedPaths,
      String finalDiffSha256,
      String evidenceChainSha256,
      String generatedAt,
      String contentSha256) {
    public Manifest {
      completedTestIds = List.copyOf(completedTestIds);
      completedStepKeys = List.copyOf(completedStepKeys);
      driverAttemptIds = List.copyOf(driverAttemptIds);
      commandObservationIds = List.copyOf(commandObservationIds);
      redReviewIds = List.copyOf(redReviewIds);
      changedPaths = List.copyOf(changedPaths);
    }
  }

  public record Decision(
      String id,
      String pairRunId,
      String action,
      String reason,
      String manifestSha256,
      String diffSha256,
      String commitSha,
      String decidedByUserId,
      String decidedAt,
      String contentSha256) {}

  public record View(
      Iteration iteration,
      Story story,
      StoryRevision storyRevision,
      ApprovedTaskingPlan approvedPlan,
      Run run,
      List<DriverAttempt> driverAttempts,
      List<CommandObservation> commandObservations,
      List<RedReview> redReviews,
      AutomationException currentException,
      Manifest manifest,
      List<Decision> decisions,
      Map<String, Object> nextAction) {
    public View {
      driverAttempts = List.copyOf(driverAttempts);
      commandObservations = List.copyOf(commandObservations);
      redReviews = List.copyOf(redReviews);
      decisions = List.copyOf(decisions);
      nextAction = nextAction == null ? null : Collections.unmodifiableMap(nextAction);
    }
  }

  public record StartInput(
      int expectedIterationVersion,
      String approvedTaskingPlanId,
      String approvedTaskingPlanSha256,
      String executorId) {}

  public record StartResult(View pair, String leaseToken) {}

  public record ActionAuthority(
      String pairRunId, String actionId, int expectedPairVersion, String leaseToken) {}

  public record DriverAttemptInput(
      ActionAuthority authority,
      String role,
      String mode,
      String summary,
      List<String> changedPaths,
      String beforeWorktreeSha256,
      String afterWorktreeSha256,
      String diffSha256,
      int agentCallCount,
      Integer inputTokens,
      Integer outputTokens) {}

  public record CommandObservationInput(
      ActionAuthority authority,
      String stage,
      String command,
      String termination,
      Integer exitCode,
      String signal,
      int durationMs,
      String stdoutSha256,
      int stdoutBytes,
      int stdoutLines,
      String stderrSha256,
      int stderrBytes,
      int stderrLines,
      String worktreeSha256,
      String diffSha256) {}

  public record RedReviewInput(
      ActionAuthority authority, String observationId, String classification, String reason) {}

  public record ExceptionInput(
      ActionAuthority authority, String kind, String summary, String failureFingerprint) {}

  public record ClaimLeaseInput(String pairRunId, int expectedPairVersion, String executorId) {}

  public record ClaimLeaseResult(Run run, String leaseToken) {}

  public record HeartbeatLeaseInput(String pairRunId, int expectedPairVersion, String leaseToken) {}

  public record DecideInput(
      int expectedPairVersion,
      String action,
      String reason,
      String manifestSha256,
      String diffSha256,
      String commitSha) {}

  public record ActionResult(View pair, String acceptedRecordId) {}

  public interface Association {
    Optional<View> findPair(String iterationId);

    StartResult startPair(String iterationId, StartInput input);

    ClaimLeaseResult claimPairLease(String iterationId, ClaimLeaseInput input);

    Run heartbeatPairLease(String iterationId, HeartbeatLeaseInput input);

    ActionResult recordPairDriverAttempt(String iterationId, DriverAttemptInput input);

    ActionResult recordPairCommandObservation(String iterationId, CommandObservationInput input);

    ActionResult recordPairRedReview(String iterationId, RedReviewInput input);

    ActionResult recordPairException(String iterationId, ExceptionInput input);

    ActionResult decidePair(String iterationId, DecideInput input, String decidedByUserId);
  }

  public static StartInput normalize(StartInput input) {
    required(input, "Pair start input");
    return new StartInput(
        positive(input.expectedIterationVersion(), "Iteration version"),
        identifier(input.approvedTaskingPlanId(), "Approved Tasking Plan id"),
        sha(input.approvedTaskingPlanSha256(), "Approved Tasking Plan SHA-256"),
        identifier(input.executorId(), "Pair executor id"));
  }

  public static ClaimLeaseInput normalize(ClaimLeaseInput input) {
    required(input, "Pair lease input");
    return new ClaimLeaseInput(
        identifier(input.pairRunId(), "Pair Run id"),
        positive(input.expectedPairVersion(), "Pair version"),
        identifier(input.executorId(), "Pair executor id"));
  }

  public static HeartbeatLeaseInput normalize(HeartbeatLeaseInput input) {
    required(input, "Pair heartbeat input");
    return new HeartbeatLeaseInput(
        identifier(input.pairRunId(), "Pair Run id"),
        positive(input.expectedPairVersion(), "Pair version"),
        requiredText(input.leaseToken(), "Pair lease token", 1_000));
  }

  public static DriverAttemptInput normalize(DriverAttemptInput input) {
    required(input, "Pair Driver attempt");
    ActionAuthority authority = normalize(input.authority());
    String role = oneOf(input.role(), "Pair Driver role", Set.of("test", "production", "refactor"));
    String mode =
        oneOf(
            input.mode(),
            "Pair Driver mode",
            Set.of(
                "write_test",
                "repair_test",
                "implement",
                "repair_implementation",
                "refactor",
                "repair_refactor",
                "repair_quality_gate"));
    if (input.changedPaths() == null || input.changedPaths().size() > 200) {
      throw DomainException.validation("Pair changed paths must be a bounded array");
    }
    return new DriverAttemptInput(
        authority,
        role,
        mode,
        requiredText(input.summary(), "Pair Driver summary", 2_000),
        input.changedPaths().stream().map(Pair::relativePath).distinct().toList(),
        sha(input.beforeWorktreeSha256(), "before worktree SHA-256"),
        sha(input.afterWorktreeSha256(), "after worktree SHA-256"),
        sha(input.diffSha256(), "Pair diff SHA-256"),
        nonnegative(input.agentCallCount(), "Pair agent call count"),
        nullableNonnegative(input.inputTokens(), "Pair input tokens"),
        nullableNonnegative(input.outputTokens(), "Pair output tokens"));
  }

  public static CommandObservationInput normalize(CommandObservationInput input) {
    required(input, "Pair command observation");
    return new CommandObservationInput(
        normalize(input.authority()),
        oneOf(
            input.stage(),
            "Pair command stage",
            Set.of("red", "green", "refactor", "quality_gate")),
        requiredLine(input.command(), "Pair command"),
        oneOf(
            input.termination(),
            "Pair termination",
            Set.of("exited", "timed_out", "signaled", "spawn_error")),
        input.exitCode(),
        optionalLine(input.signal(), "Pair signal"),
        nonnegative(input.durationMs(), "Pair duration"),
        sha(input.stdoutSha256(), "Pair stdout SHA-256"),
        nonnegative(input.stdoutBytes(), "Pair stdout bytes"),
        nonnegative(input.stdoutLines(), "Pair stdout lines"),
        sha(input.stderrSha256(), "Pair stderr SHA-256"),
        nonnegative(input.stderrBytes(), "Pair stderr bytes"),
        nonnegative(input.stderrLines(), "Pair stderr lines"),
        sha(input.worktreeSha256(), "Pair worktree SHA-256"),
        sha(input.diffSha256(), "Pair diff SHA-256"));
  }

  public static RedReviewInput normalize(RedReviewInput input) {
    required(input, "Pair Red Review");
    return new RedReviewInput(
        normalize(input.authority()),
        identifier(input.observationId(), "Pair observation id"),
        oneOf(
            input.classification(),
            "Pair Red classification",
            Set.of(
                "behavior",
                "compile",
                "dependency",
                "configuration",
                "network",
                "fixture",
                "other")),
        requiredText(input.reason(), "Pair Red Review reason", 2_000));
  }

  public static ExceptionInput normalize(ExceptionInput input) {
    required(input, "Pair exception");
    return new ExceptionInput(
        normalize(input.authority()),
        oneOf(
            input.kind(),
            "Pair exception kind",
            Set.of(
                "unexpected_green",
                "pseudo_red",
                "green_failed",
                "refactor_failed",
                "quality_gate_failed",
                "path_violation",
                "git_head_changed",
                "project_ownership_changed",
                "lease_expired",
                "interrupted",
                "budget_exhausted",
                "no_progress",
                "evidence_mismatch",
                "runtime_failure")),
        requiredText(input.summary(), "Pair exception summary", 2_000),
        input.failureFingerprint() == null
            ? null
            : sha(input.failureFingerprint(), "Pair failure fingerprint"));
  }

  public static DecideInput normalize(DecideInput input) {
    required(input, "Pair decision");
    String action =
        oneOf(
            input.action(),
            "Pair decision",
            Set.of(
                "approve",
                "back_test",
                "back_implementation",
                "back_tasking",
                "retry_quality",
                "cancel"));
    String commitSha = input.commitSha() == null ? null : gitSha(input.commitSha());
    if ("approve".equals(action)
        && (input.manifestSha256() == null || input.diffSha256() == null || commitSha == null)) {
      throw DomainException.validation(
          "Pair approval requires Manifest, diff, and commit authority");
    }
    return new DecideInput(
        positive(input.expectedPairVersion(), "Pair version"),
        action,
        requiredText(input.reason(), "Pair decision reason", 2_000),
        input.manifestSha256() == null
            ? null
            : sha(input.manifestSha256(), "Pair Manifest SHA-256"),
        input.diffSha256() == null ? null : sha(input.diffSha256(), "Pair diff SHA-256"),
        commitSha);
  }

  public static ExecutionPlan materializeExecutionPlan(TaskingPlanCandidateDescription plan) {
    if (plan.planVersion() != 2) {
      throw DomainException.conflict("Pair requires an Approved Tasking Plan v2");
    }
    Map<String, Tasking.Project> projects = new LinkedHashMap<>();
    plan.projectCatalog().projects().forEach(project -> projects.put(project.id(), project));
    Map<String, Tasking.ProcessSelection> processes = new LinkedHashMap<>();
    plan.processes().forEach(process -> processes.put(process.runtimePlanId(), process));
    Map<String, Tasking.TestDescription> tests = new LinkedHashMap<>();
    plan.tests().forEach(test -> tests.put(test.id(), test));
    List<WorkUnit> units = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (Tasking.TaskDescription task : plan.tasks()) {
      for (String testId : task.testIds()) {
        if (!seen.add(testId))
          throw DomainException.conflict(testId + " appears twice in the Pair plan");
        Tasking.TestDescription test = tests.get(testId);
        if (test == null) throw DomainException.conflict(testId + " is missing from the Pair plan");
        Tasking.ProcessSelection process = processes.get(test.runtimePlanId());
        if (process == null || !process.processId().equals(test.processId())) {
          throw DomainException.conflict(testId + " lost its selected process");
        }
        TaskingCatalog.Process definition =
            TaskingCatalog.PROCESSES.stream()
                .filter(candidate -> candidate.id().equals(process.processId()))
                .findFirst()
                .orElseThrow(() -> DomainException.conflict(testId + " lost its process"));
        TaskingCatalog.ProcessStep step =
            definition.steps().stream()
                .filter(candidate -> candidate.id().equals(test.stepId()))
                .findFirst()
                .orElseThrow(() -> DomainException.conflict(testId + " lost its process step"));
        List<Tasking.MaterializedCommand> commands =
            process.focusedCommands().stream()
                .filter(
                    command ->
                        command.testId().equals(test.id()) && command.stepId().equals(step.id()))
                .toList();
        if (commands.size() != 1) {
          throw DomainException.conflict(testId + " must have one locked focused command");
        }
        List<String> productionRoots =
            process.projectIds().stream()
                .map(
                    projectId -> {
                      Tasking.Project project = projects.get(projectId);
                      if (project == null) {
                        throw DomainException.conflict(
                            process.runtimePlanId() + " lost Nx project " + projectId);
                      }
                      return project.root();
                    })
                .distinct()
                .toList();
        units.add(
            new WorkUnit(
                units.size(),
                process.runtimePlanId() + ":" + step.id(),
                task,
                test,
                process,
                step,
                commands.get(0),
                step.nearestTestRoots(),
                productionRoots));
      }
    }
    if (units.size() != tests.size()) {
      throw DomainException.conflict("Every Pair TEST must belong to one TASK");
    }
    List<QualityGate> gates = new ArrayList<>();
    Set<String> gateKeys = new LinkedHashSet<>();
    for (Tasking.ProcessSelection process : plan.processes()) {
      for (Tasking.MaterializedGate gate : process.qualityGates()) {
        String key =
            process.processId()
                + "\u0000"
                + gate.projectId()
                + "\u0000"
                + gate.target()
                + "\u0000"
                + gate.command();
        if (gateKeys.add(key)) {
          gates.add(
              new QualityGate(
                  gates.size(),
                  process.processId(),
                  gate.projectId(),
                  gate.target(),
                  gate.command()));
        }
      }
    }
    if (gates.isEmpty()) throw DomainException.conflict("Pair requires locked quality gates");
    return new ExecutionPlan(units, gates);
  }

  public static Map<String, Object> nextAction(View view) {
    Run run = view.run();
    if ("approved".equals(run.status()) || "cancelled".equals(run.status())) return null;
    if ("exception".equals(run.status())) {
      if (view.currentException() == null) {
        throw DomainException.internal("Pair Run " + run.id() + " lost its active exception");
      }
      return action(
          run.version(),
          map(
              "kind", "resolve_exception",
              "exceptionId", view.currentException().id(),
              "allowedRoutes", view.currentException().allowedRoutes()));
    }
    if ("approval_required".equals(run.status())) {
      if (view.manifest() == null
          || !view.manifest().contentSha256().equals(run.finalManifestSha256())) {
        throw DomainException.internal("Pair Run " + run.id() + " lost its execution Manifest");
      }
      return action(
          run.version(),
          map("kind", "await_human", "manifestSha256", view.manifest().contentSha256()));
    }

    ExecutionPlan execution = materializeExecutionPlan(view.approvedPlan().getDescription().plan());
    WorkUnit unit =
        run.cursor().unitIndex() < execution.workUnits().size()
            ? execution.workUnits().get(run.cursor().unitIndex())
            : null;
    List<String> frozenTestPaths =
        view.driverAttempts().stream()
            .filter(attempt -> "test".equals(attempt.role()))
            .flatMap(attempt -> attempt.changedPaths().stream())
            .distinct()
            .sorted()
            .toList();
    return switch (run.checkpoint()) {
      case "plan_confirmed" ->
          unit == null
              ? qualityGateAction(
                  run.version(),
                  execution.qualityGates(),
                  0,
                  run.executionBudget().commandTimeoutMs())
              : driverAction(
                  run.version(),
                  "test",
                  "repair_test".equals(run.cursor().repairMode()) ? "repair_test" : "write_test",
                  unit,
                  null,
                  frozenTestPaths,
                  run.cursor());
      case "test_written" -> testWrittenAction(view, unit, frozenTestPaths);
      case "red_observed" ->
          driverAction(
              run.version(),
              "production",
              "repair_implementation".equals(run.cursor().repairMode())
                  ? "repair_implementation"
                  : "implement",
              requireUnit(run, unit),
              null,
              frozenTestPaths,
              run.cursor());
      case "implementation_written" ->
          commandAction(
              run.version(),
              "green",
              requireUnit(run, unit),
              null,
              run.executionBudget().commandTimeoutMs());
      case "green_observed" -> {
        String stepKey = run.cursor().pendingRefactorStepKey();
        WorkUnit stepUnit =
            execution.workUnits().stream()
                .filter(candidate -> candidate.stepKey().equals(stepKey))
                .findFirst()
                .orElseThrow(
                    () ->
                        DomainException.internal(
                            "Pair Run " + run.id() + " has an invalid checkpoint"));
        yield driverAction(
            run.version(),
            "refactor",
            "repair_refactor".equals(run.cursor().repairMode()) ? "repair_refactor" : "refactor",
            stepUnit,
            stepKey,
            frozenTestPaths,
            run.cursor());
      }
      case "refactored" -> refactoredAction(view, execution, frozenTestPaths);
      case "quality_gates_passed", "approved" ->
          view.manifest() != null
                  && view.manifest().contentSha256().equals(run.finalManifestSha256())
              ? action(
                  run.version(),
                  map("kind", "await_human", "manifestSha256", view.manifest().contentSha256()))
              : invalidCheckpoint(run);
      default -> invalidCheckpoint(run);
    };
  }

  private static Map<String, Object> testWrittenAction(
      View view, WorkUnit unit, List<String> frozenTestPaths) {
    Run run = view.run();
    WorkUnit current = requireUnit(run, unit);
    CommandObservation observation =
        view.commandObservations().stream()
            .filter(
                candidate ->
                    "red".equals(candidate.stage())
                        && current.test().id().equals(candidate.testId())
                        && java.util.Objects.equals(
                            candidate.diffSha256(), run.currentDiffSha256()))
            .reduce((left, right) -> right)
            .orElse(null);
    if (observation == null) {
      return commandAction(
          run.version(), "red", current, null, run.executionBudget().commandTimeoutMs());
    }
    RedReview review =
        view.redReviews().stream()
            .filter(candidate -> observation.id().equals(candidate.observationId()))
            .findFirst()
            .orElse(null);
    if (review == null) {
      return action(
          run.version(),
          map(
              "kind", "review_red",
              "workUnit", current,
              "observationId", observation.id(),
              "expectedFailureKind", current.step().red().expectedFailureKind(),
              "expectedFailure", current.step().red().expectedFailure()));
    }
    if (!review.accepted()) return invalidCheckpoint(run);
    return driverAction(
        run.version(),
        "production",
        "implement",
        current,
        null,
        frozenTestPaths,
        new Cursor(
            run.cursor().unitIndex(),
            run.cursor().pendingRefactorStepKey(),
            run.cursor().refactorVerificationIndex(),
            run.cursor().qualityGateIndex(),
            null,
            null,
            null,
            null));
  }

  private static Map<String, Object> refactoredAction(
      View view, ExecutionPlan execution, List<String> frozenTestPaths) {
    Run run = view.run();
    Cursor cursor = run.cursor();
    if (cursor.pendingRefactorStepKey() != null) {
      List<WorkUnit> units =
          execution.workUnits().stream()
              .filter(unit -> unit.stepKey().equals(cursor.pendingRefactorStepKey()))
              .toList();
      if (cursor.refactorVerificationIndex() >= units.size()) return invalidCursor(run);
      return commandAction(
          run.version(),
          "refactor",
          units.get(cursor.refactorVerificationIndex()),
          null,
          run.executionBudget().commandTimeoutMs());
    }
    if ("repair_quality_gate".equals(cursor.repairMode())) {
      CommandObservation failed =
          view.commandObservations().stream()
              .filter(candidate -> candidate.id().equals(cursor.repairDiagnosticObservationId()))
              .findFirst()
              .orElse(null);
      WorkUnit repair =
          execution.workUnits().stream()
              .filter(
                  unit -> failed != null && unit.process().processId().equals(failed.processId()))
              .findFirst()
              .orElse(execution.workUnits().get(execution.workUnits().size() - 1));
      List<String> roots =
          execution.workUnits().stream()
              .flatMap(unit -> unit.productionRoots().stream())
              .distinct()
              .sorted()
              .toList();
      return driverAction(
          run.version(),
          "production",
          "repair_quality_gate",
          repair,
          null,
          frozenTestPaths,
          cursor,
          roots);
    }
    return qualityGateAction(
        run.version(),
        execution.qualityGates(),
        cursor.qualityGateIndex(),
        run.executionBudget().commandTimeoutMs());
  }

  private static Map<String, Object> driverAction(
      int version,
      String role,
      String mode,
      WorkUnit unit,
      String stepKey,
      List<String> frozenTestPaths,
      Cursor cursor) {
    return driverAction(
        version, role, mode, unit, stepKey, frozenTestPaths, cursor, unit.productionRoots());
  }

  private static Map<String, Object> driverAction(
      int version,
      String role,
      String mode,
      WorkUnit unit,
      String stepKey,
      List<String> frozenTestPaths,
      Cursor cursor,
      List<String> productionRoots) {
    return action(
        version,
        map(
            "kind",
            "run_driver",
            "role",
            role,
            "mode",
            mode,
            "workUnit",
            unit,
            "stepKey",
            stepKey,
            "allowedTestRoots",
            "test".equals(role) ? unit.testRoots() : List.of(),
            "allowedProductionRoots",
            "test".equals(role) ? List.of() : productionRoots,
            "frozenTestPaths",
            frozenTestPaths,
            "diagnosticObservationId",
            cursor.repairDiagnosticObservationId(),
            "repairDecisionId",
            cursor.repairDecisionId(),
            "repairInstruction",
            cursor.repairInstruction()));
  }

  private static Map<String, Object> commandAction(
      int version, String stage, WorkUnit unit, QualityGate gate, int timeoutMs) {
    String command = unit == null ? gate.command() : unit.focusedCommand().command();
    return action(
        version,
        map(
            "kind", "execute_command",
            "stage", stage,
            "workUnit", unit,
            "gate", gate,
            "command", command,
            "timeoutMs", timeoutMs));
  }

  private static Map<String, Object> qualityGateAction(
      int version, List<QualityGate> gates, int index, int timeoutMs) {
    if (index < 0 || index >= gates.size()) {
      throw DomainException.internal("Pair quality gate cursor is invalid");
    }
    return commandAction(version, "quality_gate", null, gates.get(index), timeoutMs);
  }

  public static Map<String, Object> action(int version, Map<String, Object> payload) {
    LinkedHashMap<String, Object> authority = new LinkedHashMap<>();
    authority.put("expectedPairVersion", version);
    authority.putAll(payload);
    String digest = CanonicalJson.hash(authority);
    LinkedHashMap<String, Object> action = new LinkedHashMap<>();
    action.put("actionId", "ACT-" + digest.substring("sha256:".length(), "sha256:".length() + 24));
    action.putAll(authority);
    return Collections.unmodifiableMap(action);
  }

  public static boolean commandPassed(CommandObservationInput input) {
    return "exited".equals(input.termination()) && Integer.valueOf(0).equals(input.exitCode());
  }

  public static List<String> allowedExceptionRoutes(String kind) {
    return switch (kind) {
      case "unexpected_green" -> List.of("back_test", "back_tasking", "cancel");
      case "pseudo_red" -> List.of("back_test", "back_tasking", "cancel");
      case "green_failed", "refactor_failed" ->
          List.of("back_implementation", "back_tasking", "cancel");
      case "quality_gate_failed" ->
          List.of("retry_quality", "back_implementation", "back_tasking", "cancel");
      case "path_violation", "git_head_changed", "project_ownership_changed", "evidence_mismatch" ->
          List.of("back_tasking", "cancel");
      case "lease_expired", "interrupted", "runtime_failure" ->
          List.of("back_test", "back_implementation", "retry_quality", "back_tasking", "cancel");
      default -> List.of("back_tasking", "cancel");
    };
  }

  public static Map<String, Object> map(Object... values) {
    LinkedHashMap<String, Object> result = new LinkedHashMap<>();
    for (int index = 0; index < values.length; index += 2) {
      result.put((String) values[index], values[index + 1]);
    }
    return result;
  }

  private static ActionAuthority normalize(ActionAuthority authority) {
    required(authority, "Pair action authority");
    return new ActionAuthority(
        identifier(authority.pairRunId(), "Pair Run id"),
        identifier(authority.actionId(), "Pair action id"),
        positive(authority.expectedPairVersion(), "Pair version"),
        requiredText(authority.leaseToken(), "Pair lease token", 1_000));
  }

  private static WorkUnit requireUnit(Run run, WorkUnit unit) {
    if (unit == null) return invalidCursor(run);
    return unit;
  }

  private static <T> T invalidCursor(Run run) {
    throw DomainException.internal("Pair Run " + run.id() + " has an invalid execution cursor");
  }

  private static <T> T invalidCheckpoint(Run run) {
    throw DomainException.internal("Pair Run " + run.id() + " has an invalid checkpoint");
  }

  private static String relativePath(String value) {
    String normalized = requiredLine(value, "Pair changed path").replace('\\', '/');
    if (!RELATIVE_PATH.matcher(normalized).matches()) {
      throw DomainException.validation("Pair changed path must remain repository-relative");
    }
    return normalized;
  }

  private static String identifier(String value, String label) {
    String normalized = requiredLine(value, label);
    if (!IDENTIFIER.matcher(normalized).matches()) {
      throw DomainException.validation(label + " is invalid");
    }
    return normalized;
  }

  private static String sha(String value, String label) {
    String normalized = requiredLine(value, label).toLowerCase(java.util.Locale.ROOT);
    if (!SHA256.matcher(normalized).matches()) {
      throw DomainException.validation(label + " is invalid");
    }
    return normalized;
  }

  private static String gitSha(String value) {
    String normalized = requiredLine(value, "Git commit SHA").toLowerCase(java.util.Locale.ROOT);
    if (!GIT_SHA.matcher(normalized).matches()) {
      throw DomainException.validation("Git commit SHA is invalid");
    }
    return normalized;
  }

  private static String oneOf(String value, String label, Set<String> allowed) {
    if (value == null || !allowed.contains(value)) {
      throw DomainException.validation("unsupported " + label + ": " + value);
    }
    return value;
  }

  private static int positive(int value, String label) {
    if (value < 1) throw DomainException.validation(label + " must be a positive integer");
    return value;
  }

  private static int nonnegative(int value, String label) {
    if (value < 0) throw DomainException.validation(label + " must be a non-negative integer");
    return value;
  }

  private static Integer nullableNonnegative(Integer value, String label) {
    return value == null ? null : nonnegative(value, label);
  }

  private static String requiredLine(String value, String label) {
    String normalized = requiredText(value, label, 4_000);
    if (normalized.indexOf('\n') >= 0 || normalized.indexOf('\r') >= 0) {
      throw DomainException.validation(label + " must be one line");
    }
    return normalized;
  }

  private static String optionalLine(String value, String label) {
    return value == null || value.isBlank() ? null : requiredLine(value, label);
  }

  private static String requiredText(String value, String label, int maximum) {
    if (value == null || value.trim().isEmpty() || value.trim().length() > maximum) {
      throw DomainException.validation(label + " must contain 1-" + maximum + " characters");
    }
    return value.trim();
  }

  private static void required(Object value, String label) {
    if (value == null) throw DomainException.validation(label + " is required");
  }
}
