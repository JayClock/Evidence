package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;

public record ProblemStatementDescription(
    Ref<String> iteration,
    Ref<String> story,
    int revisionNumber,
    String title,
    String problem,
    InboxWorkflow.CognitiveMode cognitiveMode,
    List<IterationWorkflow.FrozenCitation> citations,
    String contentSha256,
    Instant createdAt) {
  public ProblemStatementDescription {
    citations = List.copyOf(citations);
  }
}
