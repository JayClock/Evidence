package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;

public record KickoffProposalDescription(
    String reference,
    Ref<String> iteration,
    int sequence,
    IterationWorkflow.ProposalOrigin origin,
    String title,
    String problem,
    String role,
    String goal,
    String value,
    InboxWorkflow.CognitiveMode cognitiveMode,
    List<IterationWorkflow.FrozenCitation> citations,
    String contentSha256,
    Instant proposedAt) {
  public KickoffProposalDescription {
    citations = List.copyOf(citations);
  }
}
