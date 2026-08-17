package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import reengineering.ddd.evidence.domain.model.Delivery;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;

public record StoryRevisionDescription(
    Ref<String> story,
    int revisionNumber,
    String title,
    String problem,
    String role,
    String goal,
    String value,
    InboxWorkflow.CognitiveMode cognitiveMode,
    List<Delivery.Citation> citations,
    List<Delivery.Scenario> scenarios,
    String contentSha256,
    Ref<String> createdBy,
    Instant createdAt) {
  public StoryRevisionDescription {
    citations = List.copyOf(citations);
    scenarios = List.copyOf(scenarios);
  }
}
