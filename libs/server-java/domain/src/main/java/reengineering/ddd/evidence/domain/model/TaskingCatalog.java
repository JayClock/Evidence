package reengineering.ddd.evidence.domain.model;

import java.util.List;

/** Versioned test-process authority embedded in Tasking Candidates. */
public final class TaskingCatalog {
  private TaskingCatalog() {}

  public record RedExpectation(String expectedFailureKind, String expectedFailure) {}

  public record ReplacedBoundary(String boundary, String testDouble) {}

  public record ProcessStep(
      String id,
      String quadrant,
      String purpose,
      RedExpectation red,
      String greenDoneWhen,
      String refactorDoneWhen,
      List<String> functionalContexts,
      List<String> realBoundaries,
      List<ReplacedBoundary> replacedBoundaries,
      List<String> nearestTestRoots,
      String focusedCommandTemplate,
      boolean requiresProject) {
    public ProcessStep {
      functionalContexts = List.copyOf(functionalContexts);
      realBoundaries = List.copyOf(realBoundaries);
      replacedBoundaries = List.copyOf(replacedBoundaries);
      nearestTestRoots = List.copyOf(nearestTestRoots);
    }
  }

  public record QualityGate(String scope, String requiredTarget, String commandTemplate) {}

  public record Process(
      int version,
      String id,
      String owner,
      String runtime,
      List<String> functionalContexts,
      List<String> technicalBoundaries,
      String appliesWhen,
      List<ProcessStep> steps,
      List<QualityGate> qualityGates) {
    public Process {
      functionalContexts = List.copyOf(functionalContexts);
      technicalBoundaries = List.copyOf(technicalBoundaries);
      steps = List.copyOf(steps);
      qualityGates = List.copyOf(qualityGates);
    }
  }

  public record ExecutionPolicy(
      String id,
      int version,
      int activityTimeoutMs,
      int commandTimeoutMs,
      int baseAgentCalls,
      int agentCallsPerTest,
      int agentCallsPerStep,
      int baseCheckpoints,
      int checkpointsPerTest,
      int checkpointsPerStep,
      int checkpointsPerGate,
      int maxRetriesPerFingerprint,
      int maxNoProgressCheckpoints) {}

  public static final List<String> FUNCTIONAL_CONTEXTS =
      List.of(
          "workspace",
          "work-intake",
          "delivery",
          "logical-model",
          "diagram-projection",
          "model-proposal");

  public static final ExecutionPolicy PAIR_EXECUTION_POLICY =
      new ExecutionPolicy("pair-default", 2, 3_600_000, 600_000, 4, 3, 1, 8, 6, 3, 2, 2, 3);

  private static final List<QualityGate> PROJECT_GATES =
      List.of(
          new QualityGate("test_projects", "test", "pnpm nx test {{project}} --run"),
          new QualityGate("planned_projects", "typecheck", "pnpm nx typecheck {{project}}"),
          new QualityGate("planned_projects", "lint", "pnpm nx lint {{project}}"));

  public static final List<Process> PROCESSES =
      List.of(nestProcess(), webProcess(), electronProcess());

  private static Process nestProcess() {
    return new Process(
        3,
        "typescript-nest-feature",
        "server-platform",
        "typescript",
        FUNCTIONAL_CONTEXTS,
        List.of("nest-domain", "prisma-store", "nest-api"),
        "The Scenario changes the canonical Nest domain, PostgreSQL persistence, or REST/HAL API.",
        List.of(
            new ProcessStep(
                "nest-domain-q1",
                "Q1",
                "Drive the business rule through the isolated domain module.",
                red(
                    "The focused domain test reaches its assertion and fails because the planned business behavior is absent."),
                "The focused domain test passes with the minimum business behavior.",
                "The domain behavior is clear without changing the confirmed test outcome.",
                FUNCTIONAL_CONTEXTS,
                List.of("nest-domain"),
                List.of(),
                List.of("libs/server/domain/src"),
                "pnpm nx test {{project}} --run --testNamePattern={{test_filter}}",
                true),
            new ProcessStep(
                "nest-persistent-q1",
                "Q1",
                "Drive repository behavior behind the persistence boundary.",
                red(
                    "The focused persistence test reaches its repository assertion and fails because the planned behavior is absent."),
                "The focused persistence test passes through the approved repository boundary.",
                "The repository change is minimal and preserves the confirmed behavior.",
                FUNCTIONAL_CONTEXTS,
                List.of("nest-domain"),
                List.of(new ReplacedBoundary("prisma-store", "fake")),
                List.of("libs/server/persistent/src"),
                "pnpm nx test {{project}} --run --testNamePattern={{test_filter}}",
                true),
            new ProcessStep(
                "nest-api-q2",
                "Q2",
                "Confirm the Scenario through the composed Nest API.",
                red(
                    "The focused API test reaches its observable response assertion and fails because the Scenario outcome is absent."),
                "The focused API test observes the confirmed Scenario outcome.",
                "The composed API path remains minimal and preserves the confirmed response.",
                FUNCTIONAL_CONTEXTS,
                List.of("nest-api", "nest-domain"),
                List.of(new ReplacedBoundary("prisma-store", "fake")),
                List.of("apps/server/src", "libs/server/api/src"),
                "pnpm nx test {{project}} --run --testNamePattern={{test_filter}}",
                true)),
        PROJECT_GATES);
  }

  private static Process webProcess() {
    return new Process(
        3,
        "typescript-web-feature",
        "web-platform",
        "typescript",
        FUNCTIONAL_CONTEXTS,
        List.of("react-route", "react-feature", "rest-client", "http-server"),
        "The Scenario changes the shared React Web/Desktop frontend or REST client.",
        List.of(
            new ProcessStep(
                "web-feature-q1",
                "Q1",
                "Drive feature behavior from the nearest component test.",
                red(
                    "The focused component test reaches its user-visible assertion and fails because the planned behavior is absent."),
                "The focused component test observes the planned user-visible behavior.",
                "The feature composition is clear without changing the confirmed behavior.",
                FUNCTIONAL_CONTEXTS,
                List.of("react-feature"),
                List.of(new ReplacedBoundary("rest-client", "stub")),
                List.of("libs/web", "apps/web/src"),
                "pnpm nx test {{project}} --run --testNamePattern={{test_filter}}",
                true),
            new ProcessStep(
                "web-resource-q1",
                "Q1",
                "Drive REST resource semantics while isolating transport.",
                red(
                    "The focused resource test reaches its HAL assertion and fails because the planned resource behavior is absent."),
                "The focused resource test passes with the approved HAL behavior.",
                "The resource boundary is minimal and preserves the confirmed contract.",
                FUNCTIONAL_CONTEXTS,
                List.of("rest-client"),
                List.of(new ReplacedBoundary("http-server", "mock")),
                List.of("libs/web"),
                "pnpm nx test {{project}} --run --testNamePattern={{test_filter}}",
                true),
            new ProcessStep(
                "web-acceptance-q2",
                "Q2",
                "Confirm the Scenario through route and feature composition.",
                red(
                    "The focused acceptance test reaches its route-level assertion and fails because the Scenario outcome is absent."),
                "The focused acceptance test observes the confirmed Scenario outcome.",
                "The route composition remains minimal and preserves the acceptance outcome.",
                FUNCTIONAL_CONTEXTS,
                List.of("react-route", "react-feature", "rest-client"),
                List.of(new ReplacedBoundary("http-server", "stub")),
                List.of("apps/web/src", "libs/web"),
                "pnpm nx test {{project}} --run --testNamePattern={{test_filter}}",
                true)),
        PROJECT_GATES);
  }

  private static Process electronProcess() {
    return new Process(
        3,
        "typescript-electron-shell",
        "desktop-platform",
        "typescript",
        FUNCTIONAL_CONTEXTS,
        List.of(
            "electron-main",
            "electron-preload",
            "desktop-binding-store",
            "git-worktree",
            "http-server",
            "webview"),
        "The Scenario changes Electron main/preload, local binding, worktree, or packaging behavior.",
        List.of(
            new ProcessStep(
                "electron-shell-q1",
                "Q1",
                "Drive Electron lifecycle and security without a live renderer.",
                red(
                    "The focused Electron test reaches its lifecycle or security assertion and fails because the planned behavior is absent."),
                "The focused Electron test passes with the minimum secure shell behavior.",
                "The Electron boundary remains least-privilege and preserves the confirmed test.",
                FUNCTIONAL_CONTEXTS,
                List.of("electron-main", "electron-preload"),
                List.of(
                    new ReplacedBoundary("webview", "stub"),
                    new ReplacedBoundary("http-server", "stub")),
                List.of("apps/desktop/src"),
                "pnpm nx test @evidence/desktop --run --testNamePattern={{test_filter}}",
                false),
            new ProcessStep(
                "electron-package-q2",
                "Q2",
                "Confirm the Scenario through the packaged Electron runtime.",
                red(
                    "The focused package test reaches its packaged-runtime assertion and fails because the Scenario outcome is absent."),
                "The focused package test observes the confirmed packaged-runtime outcome.",
                "The packaged boundary remains minimal and preserves the acceptance outcome.",
                FUNCTIONAL_CONTEXTS,
                List.of("electron-main", "electron-preload", "webview"),
                List.of(new ReplacedBoundary("http-server", "stub")),
                List.of("apps/desktop/scripts", "apps/desktop/src"),
                "pnpm nx test @evidence/desktop --run --testNamePattern={{test_filter}}",
                false)),
        java.util.stream.Stream.concat(
                PROJECT_GATES.stream(),
                java.util.stream.Stream.of(
                    new QualityGate(
                        "process", null, "pnpm nx run @evidence/desktop:package-smoke")))
            .toList());
  }

  private static RedExpectation red(String expectedFailure) {
    return new RedExpectation("behavior", expectedFailure);
  }
}
