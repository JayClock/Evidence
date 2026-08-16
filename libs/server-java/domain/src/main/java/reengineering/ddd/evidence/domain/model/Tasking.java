package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import reengineering.ddd.evidence.domain.DomainException;

/** Tool-only Tasking authority, Desk Check, and immutable approved Pair plan. */
public final class Tasking {
  private static final Pattern SHA256 = Pattern.compile("^sha256:[a-f0-9]{64}$");
  private static final Pattern RUNTIME_ID = Pattern.compile("^RUNTIME-\\d{3,}$");
  private static final Pattern TEST_ID = Pattern.compile("^TEST-\\d{3,}$");
  private static final Pattern TASK_ID = Pattern.compile("^TASK-\\d{3,}$");
  private static final Pattern SAFE_TOKEN = Pattern.compile("^[A-Za-z0-9_@./:-]+$");
  private static final Pattern PROJECT_ID =
      Pattern.compile("^:?[A-Za-z0-9@][A-Za-z0-9@/_.:-]{0,199}$");
  private static final Pattern RELATIVE_ROOT =
      Pattern.compile(
          "^(?!/)(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$))[A-Za-z0-9@._/-]+$");
  private static final Pattern VARIABLE = Pattern.compile("\\{\\{([a-z_]+)}}");

  private Tasking() {}

  public enum DeskCheckAction {
    APPROVE,
    REVISE,
    ARCHITECTURE_GAP,
    PROCESS_GAP,
    SCENARIO_GAP;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static DeskCheckAction parse(String value) {
      try {
        return valueOf(required(value, "Desk Check action", 255).toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException error) {
        throw DomainException.validation("unsupported Desk Check action: " + value);
      }
    }

    public static DeskCheckAction parseStored(String value) {
      try {
        return valueOf(value.toUpperCase(Locale.ROOT));
      } catch (RuntimeException error) {
        throw DomainException.internal("unsupported Desk Check action: " + value);
      }
    }
  }

  public record NoModelImpactDescription(
      String reference,
      Ref<String> iteration,
      Ref<String> story,
      Ref<String> storyRevision,
      String storyRevisionSha256,
      String reason,
      Ref<String> decidedBy,
      Instant decidedAt,
      String contentSha256) {}

  public static final class NoModelImpact implements Entity<String, NoModelImpactDescription> {
    private final String identity;
    private final NoModelImpactDescription description;

    public NoModelImpact(String identity, NoModelImpactDescription description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public NoModelImpactDescription getDescription() {
      return description;
    }
  }

  public record Project(String id, String root, List<String> targets) {
    public Project {
      targets = List.copyOf(targets);
    }
  }

  public record ProjectCatalog(List<Project> projects) {
    public ProjectCatalog {
      projects = List.copyOf(projects);
    }
  }

  public record RuntimeInput(
      String id,
      String runtime,
      List<String> functionalContexts,
      List<String> technicalBoundaries,
      List<String> projectIds) {
    public RuntimeInput {
      functionalContexts = List.copyOf(functionalContexts);
      technicalBoundaries = List.copyOf(technicalBoundaries);
      projectIds = List.copyOf(projectIds);
    }
  }

  public record ModelRefs(List<String> entities, List<String> associations) {
    public ModelRefs {
      entities = List.copyOf(entities);
      associations = List.copyOf(associations);
    }
  }

  public record TestInput(
      String id,
      String quadrant,
      String intent,
      String runtimePlanId,
      String stepId,
      String projectId,
      String testFilter,
      List<String> supportedBy,
      List<String> scenarioIds,
      String scenarioOutcome,
      List<String> businessData,
      ModelRefs modelRefs) {
    public TestInput {
      supportedBy = List.copyOf(supportedBy);
      scenarioIds = List.copyOf(scenarioIds);
      businessData = List.copyOf(businessData);
    }
  }

  public record TaskInput(
      String id, String description, List<String> testIds, List<String> dependsOn) {
    public TaskInput {
      testIds = List.copyOf(testIds);
      dependsOn = List.copyOf(dependsOn);
    }
  }

  public record ProposeInput(
      int expectedIterationVersion,
      String storyId,
      String storyRevisionId,
      String noModelImpactDecisionId,
      String noModelImpactDecisionSha256,
      ProjectCatalog projectCatalog,
      List<RuntimeInput> runtimes,
      List<TestInput> tests,
      List<TaskInput> tasks) {
    public ProposeInput {
      runtimes = runtimes == null ? null : List.copyOf(runtimes);
      tests = tests == null ? null : List.copyOf(tests);
      tasks = tasks == null ? null : List.copyOf(tasks);
    }
  }

  public record RecordNoModelImpactInput(
      int expectedIterationVersion,
      String storyId,
      String storyRevisionId,
      String storyRevisionSha256,
      String reason) {}

  public record MaterializedCommand(
      String testId, String stepId, String projectId, String command) {}

  public record MaterializedGate(String projectId, String target, String command) {}

  public record ProcessSelection(
      String runtimePlanId,
      String processId,
      int processVersion,
      String definitionSha256,
      List<String> functionalContexts,
      List<String> technicalBoundaries,
      List<String> selectedStepIds,
      List<String> projectIds,
      String projectCatalogSha256,
      List<MaterializedCommand> focusedCommands,
      List<MaterializedGate> qualityGates,
      String materializedSha256) {
    public ProcessSelection {
      functionalContexts = List.copyOf(functionalContexts);
      technicalBoundaries = List.copyOf(technicalBoundaries);
      selectedStepIds = List.copyOf(selectedStepIds);
      projectIds = List.copyOf(projectIds);
      focusedCommands = List.copyOf(focusedCommands);
      qualityGates = List.copyOf(qualityGates);
    }
  }

  public record TestDescription(
      String id,
      String quadrant,
      String intent,
      String runtimePlanId,
      String processId,
      String stepId,
      String projectId,
      String testFilter,
      List<String> supportedBy,
      List<String> scenarioIds,
      String scenarioOutcome,
      List<String> businessData,
      ModelRefs modelRefs) {
    public TestDescription {
      supportedBy = List.copyOf(supportedBy);
      scenarioIds = List.copyOf(scenarioIds);
      businessData = List.copyOf(businessData);
    }
  }

  public record TaskDescription(
      String id,
      String description,
      List<String> testIds,
      List<String> dependsOn,
      ModelRefs modelRefs) {
    public TaskDescription {
      testIds = List.copyOf(testIds);
      dependsOn = List.copyOf(dependsOn);
    }
  }

  public record ExecutionBudget(
      String policyId,
      int policyVersion,
      String policySha256,
      int activityTimeoutMs,
      int commandTimeoutMs,
      int maxAgentCalls,
      int maxCheckpoints,
      int maxRetriesPerFingerprint,
      int maxNoProgressCheckpoints) {}

  public record CandidateDescription(
      int planVersion,
      String reference,
      Ref<String> iteration,
      Ref<String> story,
      Ref<String> storyRevision,
      String storyRevisionSha256,
      String baseCommitSha,
      Ref<String> noModelImpactDecision,
      String noModelImpactDecisionSha256,
      int sequence,
      ProjectCatalog projectCatalog,
      String projectCatalogSha256,
      List<TestDescription> tests,
      List<TaskDescription> tasks,
      List<ProcessSelection> processes,
      ExecutionBudget executionBudget,
      String contentSha256,
      Instant proposedAt) {
    public CandidateDescription {
      tests = List.copyOf(tests);
      tasks = List.copyOf(tasks);
      processes = List.copyOf(processes);
    }
  }

  public static final class Candidate implements Entity<String, CandidateDescription> {
    private final String identity;
    private final CandidateDescription description;

    public Candidate(String identity, CandidateDescription description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public CandidateDescription getDescription() {
      return description;
    }
  }

  public record DecisionDescription(
      String reference,
      Ref<String> iteration,
      Ref<String> candidate,
      String candidateSha256,
      DeskCheckAction action,
      String reason,
      Ref<String> decidedBy,
      Instant decidedAt,
      String contentSha256) {}

  public static final class Decision implements Entity<String, DecisionDescription> {
    private final String identity;
    private final DecisionDescription description;

    public Decision(String identity, DecisionDescription description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public DecisionDescription getDescription() {
      return description;
    }
  }

  public record ApprovedPlanDescription(
      Ref<String> iteration,
      Ref<String> story,
      Ref<String> storyRevision,
      Ref<String> taskingCandidate,
      Ref<String> deskCheckDecision,
      CandidateDescription plan,
      String contentSha256,
      Ref<String> approvedBy,
      Instant approvedAt) {}

  public static final class ApprovedPlan implements Entity<String, ApprovedPlanDescription> {
    private final String identity;
    private final ApprovedPlanDescription description;

    public ApprovedPlan(String identity, ApprovedPlanDescription description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public ApprovedPlanDescription getDescription() {
      return description;
    }
  }

  public record View(
      Iteration iteration,
      Delivery.Story story,
      Delivery.StoryRevision storyRevision,
      NoModelImpact noModelImpactDecision,
      Candidate currentCandidate,
      List<Decision> decisions,
      ApprovedPlan approvedPlan,
      List<TaskingCatalog.Process> processCatalog) {
    public View {
      decisions = List.copyOf(decisions);
      processCatalog = List.copyOf(processCatalog);
    }
  }

  public record DecideInput(
      int expectedIterationVersion,
      String candidateId,
      String candidateSha256,
      DeskCheckAction action,
      String reason) {}

  public record DecisionResult(Iteration iteration, Decision decision, ApprovedPlan approvedPlan) {}

  public record AuthorityScenario(
      String id,
      String title,
      List<String> given,
      String when,
      List<String> then,
      List<String> businessData) {}

  public record ValidatedRuntime(
      RuntimeInput input,
      TaskingCatalog.Process process,
      List<String> selectedStepIds,
      List<MaterializedCommand> focusedCommands,
      List<MaterializedGate> qualityGates) {}

  public record ValidatedDraft(
      ProposeInput input,
      ProjectCatalog projectCatalog,
      List<ValidatedRuntime> runtimes,
      List<TestDescription> tests,
      List<TaskDescription> tasks) {}

  public interface Association {
    Optional<View> findTasking(String iterationId);

    NoModelImpact recordNoModelImpact(
        String iterationId, RecordNoModelImpactInput input, String decidedByUserId);

    Candidate proposeTasking(String iterationId, ProposeInput input);

    DecisionResult decideTasking(String iterationId, DecideInput input, String decidedByUserId);
  }

  public static RecordNoModelImpactInput normalize(RecordNoModelImpactInput input) {
    if (input == null) throw DomainException.validation("No Model Impact input is required");
    return new RecordNoModelImpactInput(
        positive(input.expectedIterationVersion(), "Iteration version"),
        identifier(input.storyId(), "Story id"),
        identifier(input.storyRevisionId(), "Story Revision id"),
        sha(input.storyRevisionSha256(), "Story Revision SHA-256"),
        required(input.reason(), "No Model Impact reason", 2_000));
  }

  public static DecideInput normalize(DecideInput input) {
    if (input == null || input.action() == null) {
      throw DomainException.validation("Desk Check decision is required");
    }
    String reason =
        input.reason() == null || input.reason().trim().isEmpty() ? null : input.reason().trim();
    if (input.action() != DeskCheckAction.APPROVE && reason == null) {
      throw DomainException.validation(
          "Desk Check " + input.action().wireValue() + " requires a reason");
    }
    return new DecideInput(
        positive(input.expectedIterationVersion(), "Iteration version"),
        identifier(input.candidateId(), "Tasking Candidate id"),
        sha(input.candidateSha256(), "Tasking Candidate SHA-256"),
        input.action(),
        reason);
  }

  public static ValidatedDraft validate(ProposeInput raw, List<AuthorityScenario> scenarios) {
    if (raw == null) throw DomainException.validation("Tasking Candidate input is required");
    if (scenarios == null || scenarios.isEmpty()) {
      throw DomainException.conflict("Tasking requires confirmed Scenarios");
    }
    ProjectCatalog catalog = normalizeCatalog(raw.projectCatalog());
    Map<String, Project> projects = new LinkedHashMap<>();
    catalog.projects().forEach(project -> projects.put(project.id(), project));
    List<ValidatedRuntime> runtimes = normalizeRuntimes(raw.runtimes(), projects);
    List<TestDescription> tests = normalizeTests(raw.tests(), scenarios, runtimes, projects);
    List<TaskDescription> tasks = normalizeTasks(raw.tasks(), tests, runtimes);
    ProposeInput input =
        new ProposeInput(
            positive(raw.expectedIterationVersion(), "Iteration version"),
            identifier(raw.storyId(), "Story id"),
            identifier(raw.storyRevisionId(), "Story Revision id"),
            identifier(raw.noModelImpactDecisionId(), "No Model Impact Decision id"),
            sha(raw.noModelImpactDecisionSha256(), "No Model Impact Decision SHA-256"),
            catalog,
            runtimes.stream().map(ValidatedRuntime::input).toList(),
            raw.tests(),
            raw.tasks());
    Map<String, TestDescription> testsById = new HashMap<>();
    tests.forEach(test -> testsById.put(test.id(), test));
    List<ValidatedRuntime> materialized = new ArrayList<>();
    for (ValidatedRuntime runtime : runtimes) {
      List<MaterializedCommand> commands =
          tests.stream()
              .filter(test -> test.runtimePlanId().equals(runtime.input().id()))
              .map(
                  test -> {
                    TaskingCatalog.ProcessStep step =
                        runtime.process().steps().stream()
                            .filter(value -> value.id().equals(test.stepId()))
                            .findFirst()
                            .orElseThrow(
                                () -> DomainException.internal("Tasking step disappeared"));
                    return new MaterializedCommand(
                        test.id(),
                        test.stepId(),
                        test.projectId(),
                        substitute(
                            step.focusedCommandTemplate(),
                            Map.of(
                                "project",
                                test.projectId() == null ? "" : test.projectId(),
                                "test_filter",
                                test.testFilter())));
                  })
              .toList();
      materialized.add(
          new ValidatedRuntime(
              runtime.input(),
              runtime.process(),
              runtime.selectedStepIds(),
              commands,
              materializeGates(runtime, commands, testsById, projects)));
    }
    return new ValidatedDraft(input, catalog, materialized, tests, tasks);
  }

  public static ExecutionBudget budget(
      int testCount, int processStepCount, int qualityGateCount, String policySha256) {
    positive(testCount, "Pair TEST count");
    positive(processStepCount, "Pair process step count");
    positive(qualityGateCount, "Pair quality gate count");
    TaskingCatalog.ExecutionPolicy policy = TaskingCatalog.PAIR_EXECUTION_POLICY;
    return new ExecutionBudget(
        policy.id(),
        policy.version(),
        sha(policySha256, "Pair policy SHA-256"),
        policy.activityTimeoutMs(),
        policy.commandTimeoutMs(),
        policy.baseAgentCalls()
            + testCount * policy.agentCallsPerTest()
            + processStepCount * policy.agentCallsPerStep(),
        policy.baseCheckpoints()
            + testCount * policy.checkpointsPerTest()
            + processStepCount * policy.checkpointsPerStep()
            + qualityGateCount * policy.checkpointsPerGate(),
        policy.maxRetriesPerFingerprint(),
        policy.maxNoProgressCheckpoints());
  }

  private static ProjectCatalog normalizeCatalog(ProjectCatalog input) {
    if (input == null || input.projects() == null || input.projects().isEmpty()) {
      throw DomainException.validation("Tasking requires an Nx project catalog");
    }
    List<Project> projects =
        input.projects().stream()
            .map(
                project ->
                    new Project(
                        pattern(project.id(), PROJECT_ID, "Project id"),
                        pattern(project.root(), RELATIVE_ROOT, "Project relative root")
                            .replace('\\', '/'),
                        unique(project.targets(), "Project targets", false).stream()
                            .sorted()
                            .toList()))
            .sorted(Comparator.comparing(Project::id))
            .toList();
    assertUnique(projects.stream().map(Project::id).toList(), "Nx project ids");
    return new ProjectCatalog(projects);
  }

  private static List<ValidatedRuntime> normalizeRuntimes(
      List<RuntimeInput> inputs, Map<String, Project> projects) {
    if (inputs == null || inputs.isEmpty()) {
      throw DomainException.validation("Tasking requires at least one runtime plan");
    }
    assertUnique(inputs.stream().map(RuntimeInput::id).toList(), "Runtime plan ids");
    List<ValidatedRuntime> runtimes = new ArrayList<>();
    for (RuntimeInput raw : inputs) {
      String id = pattern(raw.id(), RUNTIME_ID, "Runtime plan id");
      if (!List.of("java", "typescript").contains(raw.runtime())) {
        throw DomainException.validation("unsupported Tasking runtime: " + raw.runtime());
      }
      RuntimeInput input =
          new RuntimeInput(
              id,
              raw.runtime(),
              unique(raw.functionalContexts(), id + " functional contexts", false),
              unique(raw.technicalBoundaries(), id + " technical boundaries", false),
              unique(raw.projectIds(), id + " project ids", false).stream().sorted().toList());
      for (String projectId : input.projectIds()) {
        if (!projects.containsKey(projectId)) {
          throw DomainException.validation(id + " references unknown Nx project " + projectId);
        }
      }
      List<TaskingCatalog.Process> matches =
          TaskingCatalog.PROCESSES.stream()
              .filter(
                  process ->
                      process.runtime().equals(input.runtime())
                          && process.functionalContexts().containsAll(input.functionalContexts())
                          && process.technicalBoundaries().containsAll(input.technicalBoundaries()))
              .toList();
      if (matches.size() != 1) {
        throw DomainException.validation(
            id + " must match exactly one v3 test process; matched " + matches.size());
      }
      TaskingCatalog.Process process = matches.get(0);
      List<String> steps =
          process.steps().stream()
              .filter(
                  step ->
                      step.functionalContexts().stream()
                          .anyMatch(input.functionalContexts()::contains))
              .map(TaskingCatalog.ProcessStep::id)
              .toList();
      boolean hasQ1 =
          process.steps().stream()
              .anyMatch(step -> steps.contains(step.id()) && "Q1".equals(step.quadrant()));
      boolean hasQ2 =
          process.steps().stream()
              .anyMatch(step -> steps.contains(step.id()) && "Q2".equals(step.quadrant()));
      if (!hasQ1 || !hasQ2) {
        throw DomainException.validation(id + " process has no Q1/Q2 chain");
      }
      runtimes.add(new ValidatedRuntime(input, process, steps, List.of(), List.of()));
    }
    assertUnique(
        runtimes.stream().map(runtime -> runtime.process().id()).toList(), "Selected process ids");
    return runtimes;
  }

  private static List<TestDescription> normalizeTests(
      List<TestInput> inputs,
      List<AuthorityScenario> scenarios,
      List<ValidatedRuntime> runtimes,
      Map<String, Project> projects) {
    if (inputs == null || inputs.isEmpty()) {
      throw DomainException.validation("Tasking requires a test list");
    }
    assertUnique(inputs.stream().map(TestInput::id).toList(), "TEST ids");
    List<TestDescription> tests = new ArrayList<>();
    for (TestInput raw : inputs) {
      String id = pattern(raw.id(), TEST_ID, "TEST id");
      ValidatedRuntime runtime =
          runtimes.stream()
              .filter(value -> value.input().id().equals(raw.runtimePlanId()))
              .findFirst()
              .orElseThrow(
                  () -> DomainException.validation(id + " references unknown runtime plan"));
      TaskingCatalog.ProcessStep step =
          runtime.process().steps().stream()
              .filter(value -> value.id().equals(raw.stepId()))
              .findFirst()
              .orElseThrow(
                  () -> DomainException.validation(id + " references an invalid process step"));
      if (!step.quadrant().equals(raw.quadrant())) {
        throw DomainException.validation(id + " references an invalid process step");
      }
      String projectId = optional(raw.projectId());
      if (step.requiresProject() != (projectId != null)) {
        throw DomainException.validation(id + " project ownership does not match " + step.id());
      }
      if (projectId != null) {
        Project project = projects.get(projectId);
        if (project == null || !runtime.input().projectIds().contains(projectId)) {
          throw DomainException.validation(id + " references an unplanned Nx project");
        }
        if (!project.targets().contains("test")) {
          throw DomainException.validation(projectId + " does not expose a test target");
        }
        if (step.nearestTestRoots().stream().noneMatch(root -> ownsRoot(root, project.root()))) {
          throw DomainException.validation(projectId + " does not own " + step.id() + " tests");
        }
      }
      List<String> scenarioIds = unique(raw.scenarioIds(), id + " Scenario refs", false);
      List<AuthorityScenario> selectedScenarios =
          scenarioIds.stream()
              .map(
                  scenarioId ->
                      scenarios.stream()
                          .filter(scenario -> scenario.id().equals(scenarioId))
                          .findFirst()
                          .orElseThrow(
                              () ->
                                  DomainException.validation(
                                      id + " references unknown Scenario " + scenarioId)))
              .toList();
      List<String> businessData = unique(raw.businessData(), id + " business data", false);
      Set<String> allowedData = new HashSet<>();
      selectedScenarios.forEach(scenario -> allowedData.addAll(scenario.businessData()));
      if (!allowedData.containsAll(businessData)) {
        throw DomainException.validation(id + " contains data outside its Scenarios");
      }
      if (raw.modelRefs() == null
          || !raw.modelRefs().entities().isEmpty()
          || !raw.modelRefs().associations().isEmpty()) {
        throw DomainException.validation(id + " modelRefs must be empty after no-model-impact");
      }
      String scenarioOutcome = optional(raw.scenarioOutcome());
      if ("Q2".equals(raw.quadrant())
          && (selectedScenarios.size() != 1
              || scenarioOutcome == null
              || !selectedScenarios.get(0).then().contains(scenarioOutcome))) {
        throw DomainException.validation(id + " Q2 must trace one exact Scenario Then");
      }
      tests.add(
          new TestDescription(
              id,
              raw.quadrant(),
              required(raw.intent(), id + " intent", 2_000),
              runtime.input().id(),
              runtime.process().id(),
              step.id(),
              projectId,
              pattern(raw.testFilter(), SAFE_TOKEN, id + " test filter"),
              unique(raw.supportedBy(), id + " Q1 support", true),
              scenarioIds,
              scenarioOutcome,
              businessData,
              new ModelRefs(List.of(), List.of())));
    }
    Set<String> q1 = new LinkedHashSet<>();
    tests.stream().filter(test -> "Q1".equals(test.quadrant())).forEach(test -> q1.add(test.id()));
    if (q1.isEmpty() || tests.stream().noneMatch(test -> "Q2".equals(test.quadrant()))) {
      throw DomainException.validation("Tasking requires Q1 support and Q2 acceptance tests");
    }
    for (TestDescription test : tests) {
      if ("Q1".equals(test.quadrant()) && !test.supportedBy().isEmpty()) {
        throw DomainException.validation(test.id() + " Q1 cannot declare supportedBy");
      }
      if ("Q2".equals(test.quadrant())
          && (test.supportedBy().isEmpty() || !q1.containsAll(test.supportedBy()))) {
        throw DomainException.validation(test.id() + " Q2 requires valid Q1 support");
      }
    }
    Set<String> supported = new HashSet<>();
    tests.forEach(test -> supported.addAll(test.supportedBy()));
    if (!supported.containsAll(q1)) {
      throw DomainException.validation("Every Q1 TEST must support at least one Q2 TEST");
    }
    for (AuthorityScenario scenario : scenarios) {
      for (String outcome : scenario.then()) {
        boolean covered =
            tests.stream()
                .anyMatch(
                    test ->
                        "Q2".equals(test.quadrant())
                            && test.scenarioIds().contains(scenario.id())
                            && outcome.equals(test.scenarioOutcome()));
        if (!covered) {
          throw DomainException.validation(scenario.id() + " outcome has no Q2 TEST: " + outcome);
        }
      }
    }
    for (ValidatedRuntime runtime : runtimes) {
      for (String stepId : runtime.selectedStepIds()) {
        if (tests.stream()
            .noneMatch(
                test ->
                    test.runtimePlanId().equals(runtime.input().id())
                        && test.stepId().equals(stepId))) {
          throw DomainException.validation(runtime.process().id() + "/" + stepId + " has no TEST");
        }
      }
    }
    return List.copyOf(tests);
  }

  private static List<TaskDescription> normalizeTasks(
      List<TaskInput> inputs, List<TestDescription> tests, List<ValidatedRuntime> runtimes) {
    if (inputs == null || inputs.isEmpty()) {
      throw DomainException.validation("Tasking requires implementation TASKs");
    }
    assertUnique(inputs.stream().map(TaskInput::id).toList(), "TASK ids");
    Set<String> allTests = new LinkedHashSet<>();
    tests.forEach(test -> allTests.add(test.id()));
    List<TaskDescription> tasks = new ArrayList<>();
    for (int index = 0; index < inputs.size(); index++) {
      TaskInput raw = inputs.get(index);
      String id = pattern(raw.id(), TASK_ID, "TASK id");
      List<String> testIds = unique(raw.testIds(), id + " TEST refs", false);
      if (!allTests.containsAll(testIds)) {
        throw DomainException.validation(id + " references unknown TEST");
      }
      List<String> dependencies = unique(raw.dependsOn(), id + " dependencies", true);
      Set<String> prior =
          inputs.subList(0, index).stream()
              .map(TaskInput::id)
              .collect(java.util.stream.Collectors.toSet());
      if (!prior.containsAll(dependencies)) {
        throw DomainException.validation(id + " dependencies must reference earlier TASKs");
      }
      tasks.add(
          new TaskDescription(
              id,
              required(raw.description(), id + " description", 2_000),
              testIds,
              dependencies,
              new ModelRefs(List.of(), List.of())));
    }
    for (String testId : allTests) {
      long owners = tasks.stream().filter(task -> task.testIds().contains(testId)).count();
      if (owners != 1) {
        throw DomainException.validation(testId + " must belong to exactly one TASK");
      }
    }
    Map<String, Integer> order = new HashMap<>();
    for (int processIndex = 0; processIndex < runtimes.size(); processIndex++) {
      ValidatedRuntime runtime = runtimes.get(processIndex);
      for (int stepIndex = 0; stepIndex < runtime.selectedStepIds().size(); stepIndex++) {
        order.put(
            runtime.process().id() + "/" + runtime.selectedStepIds().get(stepIndex),
            processIndex * 100 + stepIndex);
      }
    }
    Map<String, TestDescription> byId = new HashMap<>();
    tests.forEach(test -> byId.put(test.id(), test));
    List<Integer> ranks = new ArrayList<>();
    tasks.forEach(
        task ->
            task.testIds()
                .forEach(
                    testId -> {
                      TestDescription test = byId.get(testId);
                      Integer rank = order.get(test.processId() + "/" + test.stepId());
                      if (rank == null)
                        throw DomainException.internal(testId + " lost process order");
                      ranks.add(rank);
                    }));
    for (int index = 1; index < ranks.size(); index++) {
      if (ranks.get(index) < ranks.get(index - 1)) {
        throw DomainException.validation("TASK order must preserve process-step order");
      }
    }
    return List.copyOf(tasks);
  }

  private static List<MaterializedGate> materializeGates(
      ValidatedRuntime runtime,
      List<MaterializedCommand> commands,
      Map<String, TestDescription> tests,
      Map<String, Project> projects) {
    List<String> testProjects =
        commands.stream()
            .map(command -> tests.get(command.testId()).projectId())
            .filter(java.util.Objects::nonNull)
            .distinct()
            .sorted()
            .toList();
    LinkedHashMap<String, MaterializedGate> gates = new LinkedHashMap<>();
    for (TaskingCatalog.QualityGate gate : runtime.process().qualityGates()) {
      if ("process".equals(gate.scope())) {
        MaterializedGate value = new MaterializedGate(null, null, gate.commandTemplate());
        gates.put(value.toString(), value);
        continue;
      }
      List<String> ids =
          "test_projects".equals(gate.scope()) ? testProjects : runtime.input().projectIds();
      for (String projectId : ids) {
        Project project = projects.get(projectId);
        if (project == null
            || gate.requiredTarget() == null
            || !project.targets().contains(gate.requiredTarget())) {
          throw DomainException.validation(
              projectId + " does not expose required " + gate.requiredTarget() + " target");
        }
        MaterializedGate value =
            new MaterializedGate(
                projectId,
                gate.requiredTarget(),
                substitute(gate.commandTemplate(), Map.of("project", projectId)));
        gates.put(value.toString(), value);
      }
    }
    return List.copyOf(gates.values());
  }

  private static String substitute(String template, Map<String, String> values) {
    Matcher matcher = VARIABLE.matcher(template);
    StringBuilder output = new StringBuilder();
    while (matcher.find()) {
      String key = matcher.group(1);
      String value = values.get(key);
      if (value == null || value.isEmpty() || !SAFE_TOKEN.matcher(value).matches()) {
        throw DomainException.validation("Tasking command variable " + key + " is unsafe");
      }
      matcher.appendReplacement(output, Matcher.quoteReplacement(value));
    }
    matcher.appendTail(output);
    return output.toString();
  }

  private static boolean ownsRoot(String stepRoot, String projectRoot) {
    return projectRoot.equals(stepRoot)
        || projectRoot.startsWith(stepRoot + "/")
        || stepRoot.startsWith(projectRoot + "/");
  }

  private static List<String> unique(List<String> values, String label, boolean allowEmpty) {
    if (values == null || (!allowEmpty && values.isEmpty())) {
      throw DomainException.validation(
          label + " must be " + (allowEmpty ? "an" : "a non-empty") + " array");
    }
    List<String> normalized = values.stream().map(value -> required(value, label, 2_000)).toList();
    assertUnique(normalized, label);
    return normalized;
  }

  private static void assertUnique(List<String> values, String label) {
    if (new HashSet<>(values).size() != values.size()) {
      throw DomainException.validation(label + " must be unique");
    }
  }

  private static String optional(String value) {
    return value == null || value.trim().isEmpty() ? null : value.trim();
  }

  private static String required(String value, String label, int maximum) {
    String normalized = value == null ? "" : value.trim();
    if (normalized.isEmpty() || normalized.length() > maximum) {
      throw DomainException.validation(label + " is invalid");
    }
    return normalized;
  }

  private static String pattern(String value, Pattern pattern, String label) {
    String normalized = required(value, label, 500);
    if (!pattern.matcher(normalized).matches()) {
      throw DomainException.validation(label + " is invalid");
    }
    return normalized;
  }

  private static String identifier(String value, String label) {
    return pattern(value, Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$"), label);
  }

  private static String sha(String value, String label) {
    String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    if (!SHA256.matcher(normalized).matches()) {
      throw DomainException.validation(label + " is invalid");
    }
    return normalized;
  }

  private static int positive(int value, String label) {
    if (value < 1) throw DomainException.validation(label + " must be a positive integer");
    return value;
  }
}
