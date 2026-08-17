package reengineering.ddd.evidence.domain.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.TaskingPlanCandidateDescription;

/** Fresh-Q2, product observation, independent review, and human Showcase authority. */
public final class Showcase {
  private static final Pattern SHA256 = Pattern.compile("^sha256:[a-f0-9]{64}$");
  private static final Pattern GIT_SHA = Pattern.compile("^[a-f0-9]{40,64}$");
  private static final Pattern WINDOWS_PATH = Pattern.compile("^(?:[a-zA-Z]:[\\\\/]|\\\\\\\\)");
  private static final Set<String> Q3_ACTIVITIES =
      Set.of("exploratory", "usability", "accessibility", "compatibility", "other");
  private static final Set<String> Q4_ACTIVITIES =
      Set.of("performance", "security", "reliability", "operability", "other");
  public static final Map<String, FeedbackRoute> FEEDBACK_ROUTES = feedbackRoutes();

  private Showcase() {}

  public record FeedbackRoute(String loop, String stage) {}

  public record Run(
      String id,
      String reference,
      int attempt,
      String workspaceId,
      String iterationId,
      String storyId,
      String storyRevisionId,
      String storyRevisionSha256,
      String approvedTaskingPlanId,
      String approvedTaskingPlanSha256,
      String pairRunId,
      String pairManifestId,
      String pairManifestSha256,
      String approvedCommitSha,
      String stage,
      int version,
      String evidenceBundleSha256,
      String startedAt,
      String updatedAt,
      String completedAt) {}

  public record Q2Check(
      String testId,
      List<String> scenarioIds,
      String processId,
      String stepId,
      String projectId,
      String command) {
    public Q2Check {
      scenarioIds = List.copyOf(scenarioIds);
    }
  }

  public record Q2Observation(
      String id,
      String showcaseRunId,
      String actionId,
      int sequence,
      String testId,
      List<String> scenarioIds,
      String processId,
      String stepId,
      String projectId,
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
      String approvedCommitSha,
      String worktreeSha256,
      String observedAt,
      String previousRecordSha256,
      String recordSha256) {
    public Q2Observation {
      scenarioIds = List.copyOf(scenarioIds);
    }
  }

  public record ProductObservation(
      String id,
      String showcaseRunId,
      String scenarioId,
      String scenarioReference,
      List<String> givenSteps,
      String whenStep,
      List<String> expectedThenSteps,
      List<String> businessData,
      List<String> observedOutcomes,
      String observation,
      String valueFeedback,
      List<String> evidenceRefs,
      String observedByUserId,
      String observedAt,
      String contentSha256) {
    public ProductObservation {
      givenSteps = List.copyOf(givenSteps);
      expectedThenSteps = List.copyOf(expectedThenSteps);
      businessData = List.copyOf(businessData);
      observedOutcomes = List.copyOf(observedOutcomes);
      evidenceRefs = List.copyOf(evidenceRefs);
    }
  }

  public record RiskDecision(
      String id,
      String showcaseRunId,
      String quadrant,
      String disposition,
      List<String> activities,
      String reason,
      String decidedByUserId,
      String decidedAt,
      String contentSha256) {
    public RiskDecision {
      activities = List.copyOf(activities);
    }
  }

  public record Evaluation(
      String id,
      String showcaseRunId,
      int sequence,
      String quadrant,
      String activity,
      String outcome,
      String finding,
      List<String> evidenceRefs,
      String observedByUserId,
      String observedAt,
      String contentSha256) {
    public Evaluation {
      evidenceRefs = List.copyOf(evidenceRefs);
    }
  }

  public record Review(
      String id,
      String showcaseRunId,
      String evidenceBundleSha256,
      List<String> observedFacts,
      List<String> productDomainFeedback,
      List<String> technicalQualityFeedback,
      List<String> unresolvedAssumptions,
      String recommendation,
      String reviewedAt,
      String contentSha256) {
    public Review {
      observedFacts = List.copyOf(observedFacts);
      productDomainFeedback = List.copyOf(productDomainFeedback);
      technicalQualityFeedback = List.copyOf(technicalQualityFeedback);
      unresolvedAssumptions = List.copyOf(unresolvedAssumptions);
    }
  }

  public record Decision(
      String id,
      String showcaseRunId,
      String action,
      String reason,
      String feedbackTarget,
      String evidenceBundleSha256,
      String reviewId,
      String decidedByUserId,
      String decidedAt,
      String contentSha256) {}

  public record View(
      Iteration iteration,
      Story story,
      StoryRevision storyRevision,
      ApprovedTaskingPlan approvedPlan,
      Pair.Run pairRun,
      Pair.Manifest pairManifest,
      Run run,
      List<Q2Observation> q2Observations,
      List<ProductObservation> productObservations,
      List<RiskDecision> riskDecisions,
      List<Evaluation> evaluations,
      Review review,
      Decision decision,
      Map<String, Object> nextAction) {
    public View {
      q2Observations = List.copyOf(q2Observations);
      productObservations = List.copyOf(productObservations);
      riskDecisions = List.copyOf(riskDecisions);
      evaluations = List.copyOf(evaluations);
      nextAction = nextAction == null ? null : Collections.unmodifiableMap(nextAction);
    }
  }

  public record Q2ObservationInput(
      String showcaseRunId,
      String actionId,
      int expectedShowcaseVersion,
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
      String approvedCommitSha,
      String worktreeSha256) {}

  public record ProductObservationInput(
      int expectedShowcaseVersion,
      String scenarioId,
      List<String> observedOutcomes,
      String observation,
      String valueFeedback,
      List<String> evidenceRefs) {}

  public record RiskDecisionInput(
      int expectedShowcaseVersion,
      String quadrant,
      String disposition,
      List<String> activities,
      String reason) {}

  public record EvaluationInput(
      int expectedShowcaseVersion,
      String quadrant,
      String activity,
      String outcome,
      String finding,
      List<String> evidenceRefs) {}

  public record ReviewInput(
      int expectedShowcaseVersion,
      String evidenceBundleSha256,
      List<String> observedFacts,
      List<String> productDomainFeedback,
      List<String> technicalQualityFeedback,
      List<String> unresolvedAssumptions,
      String recommendation) {}

  public record DecideInput(
      int expectedShowcaseVersion,
      String action,
      String reason,
      String evidenceBundleSha256,
      String reviewSha256,
      String feedbackTarget) {}

  public record ActionResult(View showcase, String acceptedRecordId) {}

  public interface Association {
    Optional<View> findShowcase(String iterationId);

    ActionResult recordQ2Observation(String iterationId, Q2ObservationInput input);

    ActionResult recordProductObservation(
        String iterationId, ProductObservationInput input, String observedByUserId);

    ActionResult recordRiskDecision(
        String iterationId, RiskDecisionInput input, String decidedByUserId);

    ActionResult recordEvaluation(
        String iterationId, EvaluationInput input, String observedByUserId);

    ActionResult recordReview(String iterationId, ReviewInput input);

    ActionResult decideShowcase(String iterationId, DecideInput input, String decidedByUserId);
  }

  public static Q2ObservationInput normalize(Q2ObservationInput input) {
    required(input, "Showcase Q2 observation");
    return new Q2ObservationInput(
        line(input.showcaseRunId(), "Showcase Run id"),
        line(input.actionId(), "Showcase action id"),
        positive(input.expectedShowcaseVersion()),
        line(input.command(), "Showcase Q2 command"),
        oneOf(
            input.termination(),
            "Q2 termination",
            Set.of("exited", "timed_out", "signaled", "spawn_error")),
        input.exitCode(),
        optionalLine(input.signal(), "Q2 signal"),
        nonnegative(input.durationMs(), "Q2 duration"),
        sha(input.stdoutSha256(), "Q2 stdout SHA-256"),
        nonnegative(input.stdoutBytes(), "Q2 stdout bytes"),
        nonnegative(input.stdoutLines(), "Q2 stdout lines"),
        sha(input.stderrSha256(), "Q2 stderr SHA-256"),
        nonnegative(input.stderrBytes(), "Q2 stderr bytes"),
        nonnegative(input.stderrLines(), "Q2 stderr lines"),
        gitSha(input.approvedCommitSha()),
        sha(input.worktreeSha256(), "Q2 worktree SHA-256"));
  }

  public static ProductObservationInput normalize(ProductObservationInput input) {
    required(input, "Showcase product observation");
    return new ProductObservationInput(
        positive(input.expectedShowcaseVersion()),
        line(input.scenarioId(), "Scenario id"),
        textList(input.observedOutcomes(), "Observed outcomes", true),
        text(input.observation(), "Product observation", 4_000),
        text(input.valueFeedback(), "Value feedback", 4_000),
        evidenceRefs(input.evidenceRefs()));
  }

  public static RiskDecisionInput normalize(RiskDecisionInput input) {
    required(input, "Showcase risk decision");
    String quadrant = oneOf(input.quadrant(), "risk quadrant", Set.of("Q3", "Q4"));
    String disposition =
        oneOf(input.disposition(), "risk disposition", Set.of("required", "not_required"));
    List<String> activities = activities(input.activities(), quadrant);
    if ("required".equals(disposition) && activities.isEmpty()) {
      throw DomainException.validation(
          quadrant + " required disposition must select an evaluation activity");
    }
    if ("not_required".equals(disposition) && !activities.isEmpty()) {
      throw DomainException.validation(
          quadrant + " not_required disposition cannot select activities");
    }
    return new RiskDecisionInput(
        positive(input.expectedShowcaseVersion()),
        quadrant,
        disposition,
        activities,
        text(input.reason(), quadrant + " decision reason", 4_000));
  }

  public static EvaluationInput normalize(EvaluationInput input) {
    required(input, "Showcase evaluation");
    String quadrant = oneOf(input.quadrant(), "evaluation quadrant", Set.of("Q3", "Q4"));
    return new EvaluationInput(
        positive(input.expectedShowcaseVersion()),
        quadrant,
        activity(input.activity(), quadrant),
        oneOf(input.outcome(), "evaluation outcome", Set.of("passed", "concern")),
        text(input.finding(), "Evaluation finding", 4_000),
        evidenceRefs(input.evidenceRefs()));
  }

  public static ReviewInput normalize(ReviewInput input) {
    required(input, "Showcase Review");
    return new ReviewInput(
        positive(input.expectedShowcaseVersion()),
        sha(input.evidenceBundleSha256(), "Showcase evidence bundle SHA-256"),
        textList(input.observedFacts(), "Observed facts", true),
        textList(input.productDomainFeedback(), "Product/domain feedback", false),
        textList(input.technicalQualityFeedback(), "Technical quality feedback", false),
        textList(input.unresolvedAssumptions(), "Unresolved assumptions", false),
        oneOf(input.recommendation(), "Showcase recommendation", Set.of("accept", "revise")));
  }

  public static DecideInput normalize(DecideInput input) {
    required(input, "Showcase decision");
    String action =
        oneOf(input.action(), "Showcase decision", Set.of("accept", "revise", "reject"));
    String target =
        input.feedbackTarget() == null || input.feedbackTarget().isBlank()
            ? null
            : oneOf(input.feedbackTarget(), "Showcase feedback target", FEEDBACK_ROUTES.keySet());
    if ("revise".equals(action) && target == null) {
      throw DomainException.validation("Showcase revise decision requires a feedback target");
    }
    if (!"revise".equals(action) && target != null) {
      throw DomainException.validation(
          "Only a Showcase revise decision can include a feedback target");
    }
    return new DecideInput(
        positive(input.expectedShowcaseVersion()),
        action,
        text(input.reason(), "Showcase decision reason", 4_000),
        optionalSha(input.evidenceBundleSha256()),
        optionalSha(input.reviewSha256()),
        target);
  }

  public static List<Q2Check> q2Checks(TaskingPlanCandidateDescription plan) {
    List<Q2Check> checks = new ArrayList<>();
    for (Tasking.TestDescription test : plan.tests()) {
      if (!"Q2".equals(test.quadrant())) continue;
      Tasking.ProcessSelection process =
          plan.processes().stream()
              .filter(candidate -> candidate.runtimePlanId().equals(test.runtimePlanId()))
              .findFirst()
              .orElseThrow(
                  () ->
                      DomainException.conflict(
                          "Approved Q2 TEST " + test.id() + " lost its locked process command"));
      Tasking.MaterializedCommand command =
          process.focusedCommands().stream()
              .filter(
                  candidate ->
                      candidate.testId().equals(test.id())
                          && candidate.stepId().equals(test.stepId()))
              .findFirst()
              .orElseThrow(
                  () ->
                      DomainException.conflict(
                          "Approved Q2 TEST " + test.id() + " lost its locked process command"));
      checks.add(
          new Q2Check(
              test.id(),
              test.scenarioIds(),
              process.processId(),
              test.stepId(),
              command.projectId(),
              command.command()));
    }
    if (checks.isEmpty()) {
      throw DomainException.conflict(
          "Approved Tasking Plan must contain at least one Q2 TEST for Showcase");
    }
    return checks;
  }

  public static Map<String, Object> nextAction(View view) {
    Run run = view.run();
    if (Set.of("accepted", "revised", "rejected").contains(run.stage())) return null;
    if ("reviewing".equals(run.stage())) {
      if (run.evidenceBundleSha256() == null) {
        throw DomainException.internal("Showcase Run " + run.id() + " lost its evidence bundle");
      }
      return action(
          run.version(),
          Pair.map("kind", "run_reviewer", "evidenceBundleSha256", run.evidenceBundleSha256()));
    }
    if ("decision".equals(run.stage())) {
      if (view.review() == null) {
        throw DomainException.internal("Showcase Run " + run.id() + " lost its independent Review");
      }
      return action(
          run.version(),
          Pair.map(
              "kind", "await_human",
              "reviewId", view.review().id(),
              "reviewSha256", view.review().contentSha256()));
    }
    for (Q2Check check : q2Checks(view.approvedPlan().getDescription().plan())) {
      Q2Observation observation =
          view.q2Observations().stream()
              .filter(candidate -> candidate.testId().equals(check.testId()))
              .findFirst()
              .orElse(null);
      if (observation == null) {
        return action(
            run.version(),
            Pair.map(
                "kind", "execute_q2",
                "testId", check.testId(),
                "scenarioIds", check.scenarioIds(),
                "processId", check.processId(),
                "stepId", check.stepId(),
                "projectId", check.projectId(),
                "command", check.command(),
                "timeoutMs",
                    view.approvedPlan()
                        .getDescription()
                        .plan()
                        .executionBudget()
                        .commandTimeoutMs(),
                "approvedCommitSha", run.approvedCommitSha()));
      }
      if (!q2Passed(observation)) {
        return action(
            run.version(),
            Pair.map(
                "kind", "resolve_failure",
                "observationId", observation.id(),
                "allowedActions", List.of("revise", "reject")));
      }
    }
    for (Delivery.Scenario scenario : view.storyRevision().getDescription().scenarios()) {
      boolean observed =
          view.productObservations().stream()
              .anyMatch(candidate -> candidate.scenarioId().equals(scenario.id()));
      if (!observed) {
        return action(
            run.version(),
            Pair.map(
                "kind", "observe_scenario",
                "scenarioId", scenario.id(),
                "scenarioReference", scenario.reference()));
      }
    }
    for (String quadrant : List.of("Q3", "Q4")) {
      RiskDecision risk =
          view.riskDecisions().stream()
              .filter(candidate -> candidate.quadrant().equals(quadrant))
              .findFirst()
              .orElse(null);
      if (risk == null) {
        return action(run.version(), Pair.map("kind", "decide_risk", "quadrant", quadrant));
      }
      for (String activity : risk.activities()) {
        Evaluation latest =
            view.evaluations().stream()
                .filter(
                    candidate ->
                        candidate.quadrant().equals(quadrant)
                            && candidate.activity().equals(activity))
                .reduce((left, right) -> right)
                .orElse(null);
        if (latest == null || "concern".equals(latest.outcome())) {
          return action(
              run.version(),
              Pair.map("kind", "evaluate_risk", "quadrant", quadrant, "activity", activity));
        }
      }
    }
    throw DomainException.internal(
        "Showcase Run " + run.id() + " is ready but was not advanced to Review");
  }

  public static boolean ready(View view) {
    for (Q2Check check : q2Checks(view.approvedPlan().getDescription().plan())) {
      Q2Observation observation =
          view.q2Observations().stream()
              .filter(candidate -> candidate.testId().equals(check.testId()))
              .findFirst()
              .orElse(null);
      if (observation == null || !q2Passed(observation)) return false;
    }
    for (Delivery.Scenario scenario : view.storyRevision().getDescription().scenarios()) {
      if (view.productObservations().stream()
          .noneMatch(candidate -> candidate.scenarioId().equals(scenario.id()))) {
        return false;
      }
    }
    for (String quadrant : List.of("Q3", "Q4")) {
      RiskDecision risk =
          view.riskDecisions().stream()
              .filter(candidate -> candidate.quadrant().equals(quadrant))
              .findFirst()
              .orElse(null);
      if (risk == null) return false;
      for (String activity : risk.activities()) {
        Evaluation latest =
            view.evaluations().stream()
                .filter(
                    candidate ->
                        candidate.quadrant().equals(quadrant)
                            && candidate.activity().equals(activity))
                .reduce((left, right) -> right)
                .orElse(null);
        if (latest == null || !"passed".equals(latest.outcome())) return false;
      }
    }
    return true;
  }

  public static Map<String, Object> action(int version, Map<String, Object> payload) {
    LinkedHashMap<String, Object> authority = new LinkedHashMap<>();
    authority.put("expectedShowcaseVersion", version);
    authority.putAll(payload);
    String digest = CanonicalJson.hash(authority);
    LinkedHashMap<String, Object> action = new LinkedHashMap<>();
    action.put("actionId", "ACT-" + digest.substring("sha256:".length(), "sha256:".length() + 24));
    action.putAll(authority);
    return Collections.unmodifiableMap(action);
  }

  public static boolean q2Passed(Q2Observation observation) {
    return "exited".equals(observation.termination())
        && Integer.valueOf(0).equals(observation.exitCode());
  }

  private static Map<String, FeedbackRoute> feedbackRoutes() {
    LinkedHashMap<String, FeedbackRoute> routes = new LinkedHashMap<>();
    routes.put("problem", new FeedbackRoute("kickoff", "candidate_drafting"));
    routes.put("story", new FeedbackRoute("kickoff", "candidate_drafting"));
    routes.put("business_knowledge", new FeedbackRoute("understand", "tqa"));
    routes.put("scenario", new FeedbackRoute("understand", "tqa"));
    routes.put("model", new FeedbackRoute("understand", "modeling"));
    routes.put("modeling_method", new FeedbackRoute("understand", "modeling"));
    routes.put("architecture", new FeedbackRoute("tasking", "drafting"));
    routes.put("test_strategy", new FeedbackRoute("tasking", "drafting"));
    routes.put("test_process", new FeedbackRoute("tasking", "drafting"));
    routes.put("value_validation", new FeedbackRoute("showcase", "setup"));
    routes.put("showcase_setup", new FeedbackRoute("showcase", "setup"));
    return Collections.unmodifiableMap(routes);
  }

  private static List<String> activities(List<String> values, String quadrant) {
    if (values == null || values.size() > 50) {
      throw DomainException.validation("Risk activities must be a bounded array");
    }
    return values.stream().map(value -> activity(value, quadrant)).distinct().toList();
  }

  private static String activity(String value, String quadrant) {
    return oneOf(
        value, quadrant + " activity", "Q3".equals(quadrant) ? Q3_ACTIVITIES : Q4_ACTIVITIES);
  }

  private static List<String> evidenceRefs(List<String> values) {
    return textList(values, "Evidence refs", true).stream()
        .map(
            value -> {
              if (value.startsWith("/")
                  || WINDOWS_PATH.matcher(value).find()
                  || value.toLowerCase(java.util.Locale.ROOT).startsWith("file:")) {
                throw DomainException.validation(
                    "Showcase evidence refs cannot contain local absolute paths");
              }
              return value;
            })
        .distinct()
        .toList();
  }

  private static List<String> textList(List<String> values, String label, boolean required) {
    if (values == null || values.size() > 50) {
      throw DomainException.validation(label + " must be a bounded array");
    }
    List<String> result = new ArrayList<>();
    for (int index = 0; index < values.size(); index++) {
      result.add(text(values.get(index), label + "[" + index + "]", 500));
    }
    if (required && result.isEmpty())
      throw DomainException.validation(label + " must not be empty");
    return List.copyOf(result);
  }

  private static String optionalSha(String value) {
    return value == null || value.isBlank() ? null : sha(value, "Showcase SHA-256");
  }

  private static String sha(String value, String label) {
    String normalized = line(value, label).toLowerCase(java.util.Locale.ROOT);
    if (!SHA256.matcher(normalized).matches())
      throw DomainException.validation(label + " is invalid");
    return normalized;
  }

  private static String gitSha(String value) {
    String normalized = line(value, "Approved commit SHA").toLowerCase(java.util.Locale.ROOT);
    if (!GIT_SHA.matcher(normalized).matches())
      throw DomainException.validation("Approved commit SHA is invalid");
    return normalized;
  }

  private static String oneOf(String value, String label, Set<String> allowed) {
    if (value == null || !allowed.contains(value)) {
      throw DomainException.validation("unsupported " + label + ": " + value);
    }
    return value;
  }

  private static int positive(int value) {
    if (value < 1)
      throw DomainException.validation("Showcase expected version must be a positive integer");
    return value;
  }

  private static int nonnegative(int value, String label) {
    if (value < 0) throw DomainException.validation(label + " must be a non-negative integer");
    return value;
  }

  private static String line(String value, String label) {
    String normalized = text(value, label, 4_000);
    if (normalized.indexOf('\n') >= 0 || normalized.indexOf('\r') >= 0) {
      throw DomainException.validation(label + " must be a non-empty single line");
    }
    return normalized;
  }

  private static String optionalLine(String value, String label) {
    return value == null || value.isBlank() ? null : line(value, label);
  }

  private static String text(String value, String label, int maximum) {
    if (value == null || value.trim().isEmpty() || value.trim().length() > maximum) {
      throw DomainException.validation(label + " must contain 1-" + maximum + " characters");
    }
    return value.trim();
  }

  private static void required(Object value, String label) {
    if (value == null) throw DomainException.validation(label + " input is required");
  }
}
