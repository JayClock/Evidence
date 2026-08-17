package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.TaskingPlanCandidateDescription;

public final class TaskingPlanCandidate implements Entity<String, TaskingPlanCandidateDescription> {
  private final String identity;
  private final TaskingPlanCandidateDescription description;

  public TaskingPlanCandidate(String identity, TaskingPlanCandidateDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public TaskingPlanCandidateDescription getDescription() {
    return description;
  }
}
