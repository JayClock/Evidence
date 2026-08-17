package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;

public record InboxExtractionDescription(
    String reference,
    Ref<String> workspace,
    InboxWorkflow.ExtractionStatus status,
    List<InboxWorkflow.ExtractionSource> sources,
    int version,
    Ref<String> requestedBy,
    Instant requestedAt,
    Instant completedAt,
    String failureSummary) {
  public InboxExtractionDescription {
    sources = List.copyOf(sources);
  }
}
