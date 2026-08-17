package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;

public record InboxStoryCandidateDescription(
    String reference,
    Ref<String> workspace,
    Ref<String> extraction,
    String title,
    String problem,
    String role,
    String goal,
    String value,
    InboxWorkflow.CognitiveMode cognitiveMode,
    List<InboxWorkflow.CandidateCitation> citations,
    String contentSha256,
    InboxWorkflow.CandidateStatus status,
    String proposedBy,
    Instant proposedAt,
    Ref<String> terminalDecision,
    Ref<String> selectedIteration) {
  public InboxStoryCandidateDescription {
    citations = List.copyOf(citations);
  }
}
