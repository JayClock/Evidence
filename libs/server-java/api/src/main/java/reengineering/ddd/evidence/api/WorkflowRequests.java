package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Tasking;
import reengineering.ddd.evidence.domain.model.Understanding;

final class WorkflowRequests {
  private WorkflowRequests() {}

  static InboxWorkflow.CandidateInput candidate(JsonNode value, String name) {
    InboxRequests.requireObject(value, name + " must be an object");
    return new InboxWorkflow.CandidateInput(
        text(value.get("title"), name + ".title"),
        text(value.get("problem"), name + ".problem"),
        text(value.get("role"), name + ".role"),
        text(value.get("goal"), name + ".goal"),
        text(value.get("value"), name + ".value"),
        text(value.get("cognitiveMode"), name + ".cognitiveMode"),
        citations(value.get("citations"), name + ".citations"));
  }

  static List<Understanding.ScenarioInput> scenarios(JsonNode value) {
    requireArray(value, "scenarios");
    List<Understanding.ScenarioInput> scenarios = new ArrayList<>();
    for (int index = 0; index < value.size(); index++) {
      JsonNode scenario = value.get(index);
      String name = "scenarios[" + index + "]";
      InboxRequests.requireObject(scenario, name + " must be an object");
      scenarios.add(
          new Understanding.ScenarioInput(
              text(scenario.get("title"), name + ".title"),
              strings(scenario.get("given"), name + ".given"),
              text(scenario.get("when"), name + ".when"),
              strings(scenario.get("then"), name + ".then"),
              strings(scenario.get("businessData"), name + ".businessData")));
    }
    return scenarios;
  }

  static Tasking.ProposeInput tasking(JsonNode body) {
    InboxRequests.requireObject(body, "body must be an object");
    JsonNode catalog = body.get("projectCatalog");
    InboxRequests.requireObject(catalog, "projectCatalog must be an object");
    List<Tasking.Project> projects = new ArrayList<>();
    JsonNode projectValues = catalog.get("projects");
    requireArray(projectValues, "projectCatalog.projects");
    for (int index = 0; index < projectValues.size(); index++) {
      JsonNode project = projectValues.get(index);
      String name = "projectCatalog.projects[" + index + "]";
      InboxRequests.requireObject(project, name + " must be an object");
      projects.add(
          new Tasking.Project(
              text(project.get("id"), name + ".id"),
              text(project.get("root"), name + ".root"),
              strings(project.get("targets"), name + ".targets")));
    }

    List<Tasking.RuntimeInput> runtimes = new ArrayList<>();
    JsonNode runtimeValues = body.get("runtimes");
    requireArray(runtimeValues, "runtimes");
    for (int index = 0; index < runtimeValues.size(); index++) {
      JsonNode runtime = runtimeValues.get(index);
      String name = "runtimes[" + index + "]";
      InboxRequests.requireObject(runtime, name + " must be an object");
      runtimes.add(
          new Tasking.RuntimeInput(
              text(runtime.get("id"), name + ".id"),
              text(runtime.get("runtime"), name + ".runtime"),
              strings(runtime.get("functionalContexts"), name + ".functionalContexts"),
              strings(runtime.get("technicalBoundaries"), name + ".technicalBoundaries"),
              strings(runtime.get("projectIds"), name + ".projectIds")));
    }

    List<Tasking.TestInput> tests = new ArrayList<>();
    JsonNode testValues = body.get("tests");
    requireArray(testValues, "tests");
    for (int index = 0; index < testValues.size(); index++) {
      JsonNode test = testValues.get(index);
      String name = "tests[" + index + "]";
      InboxRequests.requireObject(test, name + " must be an object");
      JsonNode refs = test.get("modelRefs");
      InboxRequests.requireObject(refs, name + ".modelRefs must be an object");
      tests.add(
          new Tasking.TestInput(
              text(test.get("id"), name + ".id"),
              text(test.get("quadrant"), name + ".quadrant"),
              text(test.get("intent"), name + ".intent"),
              text(test.get("runtimePlanId"), name + ".runtimePlanId"),
              text(test.get("stepId"), name + ".stepId"),
              optional(test.get("projectId"), name + ".projectId"),
              text(test.get("testFilter"), name + ".testFilter"),
              strings(test.get("supportedBy"), name + ".supportedBy"),
              strings(test.get("scenarioIds"), name + ".scenarioIds"),
              optional(test.get("scenarioOutcome"), name + ".scenarioOutcome"),
              strings(test.get("businessData"), name + ".businessData"),
              new Tasking.ModelRefs(
                  strings(refs.get("entities"), name + ".modelRefs.entities"),
                  strings(refs.get("associations"), name + ".modelRefs.associations"))));
    }

    List<Tasking.TaskInput> tasks = new ArrayList<>();
    JsonNode taskValues = body.get("tasks");
    requireArray(taskValues, "tasks");
    for (int index = 0; index < taskValues.size(); index++) {
      JsonNode task = taskValues.get(index);
      String name = "tasks[" + index + "]";
      InboxRequests.requireObject(task, name + " must be an object");
      tasks.add(
          new Tasking.TaskInput(
              text(task.get("id"), name + ".id"),
              text(task.get("description"), name + ".description"),
              strings(task.get("testIds"), name + ".testIds"),
              strings(task.get("dependsOn"), name + ".dependsOn")));
    }

    return new Tasking.ProposeInput(
        positive(body.get("expectedIterationVersion"), "expectedIterationVersion"),
        text(body.get("storyId"), "storyId"),
        text(body.get("storyRevisionId"), "storyRevisionId"),
        text(body.get("noModelImpactDecisionId"), "noModelImpactDecisionId"),
        text(body.get("noModelImpactDecisionSha256"), "noModelImpactDecisionSha256"),
        new Tasking.ProjectCatalog(projects),
        runtimes,
        tests,
        tasks);
  }

  static List<String> strings(JsonNode value, String name) {
    return InboxRequests.stringArray(value, name);
  }

  static int positive(JsonNode value, String name) {
    return InboxRequests.positiveInteger(value, name);
  }

  static String text(JsonNode value, String name) {
    return InboxRequests.requiredString(value, name, false);
  }

  static String optional(JsonNode value, String name) {
    return InboxRequests.optionalString(value, name);
  }

  private static List<InboxWorkflow.CitationInput> citations(JsonNode value, String name) {
    requireArray(value, name);
    List<InboxWorkflow.CitationInput> citations = new ArrayList<>();
    for (int index = 0; index < value.size(); index++) {
      JsonNode citation = value.get(index);
      InboxRequests.requireObject(citation, name + "[" + index + "] must be an object");
      citations.add(
          new InboxWorkflow.CitationInput(
              text(citation.get("inboxItemId"), name + "[" + index + "].inboxItemId"),
              text(citation.get("revisionSha256"), name + "[" + index + "].revisionSha256"),
              text(citation.get("locator"), name + "[" + index + "].locator")));
    }
    return citations;
  }

  private static void requireArray(JsonNode value, String name) {
    if (value == null || !value.isArray()) {
      throw DomainException.validation(name + " must be an array");
    }
  }
}
