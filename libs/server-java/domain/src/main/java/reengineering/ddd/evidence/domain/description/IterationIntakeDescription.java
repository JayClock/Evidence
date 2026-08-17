package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;

public record IterationIntakeDescription(
    Ref<String> iteration,
    IterationWorkflow.FrozenCandidate candidate,
    List<IterationWorkflow.FrozenSource> sources,
    String requirementsProjection,
    String contentSha256,
    Instant frozenAt) {
  public IterationIntakeDescription {
    sources = List.copyOf(sources);
  }
}
