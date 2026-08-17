package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import reengineering.ddd.evidence.domain.model.Tasking;

public record TaskingPlanCandidateDescription(
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
    Tasking.ProjectCatalog projectCatalog,
    String projectCatalogSha256,
    List<Tasking.TestDescription> tests,
    List<Tasking.TaskDescription> tasks,
    List<Tasking.ProcessSelection> processes,
    Tasking.ExecutionBudget executionBudget,
    String contentSha256,
    Instant proposedAt) {
  public TaskingPlanCandidateDescription {
    tests = List.copyOf(tests);
    tasks = List.copyOf(tasks);
    processes = List.copyOf(processes);
  }
}
