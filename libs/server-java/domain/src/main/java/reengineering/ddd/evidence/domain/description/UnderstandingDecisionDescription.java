package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import reengineering.ddd.evidence.domain.model.Understanding;

public record UnderstandingDecisionDescription(
    String reference,
    Ref<String> iteration,
    Ref<String> story,
    Ref<String> storyRevision,
    Ref<String> proposal,
    String proposalSha256,
    Understanding.DecisionAction action,
    String reason,
    List<Ref<String>> selectedDrafts,
    List<Ref<String>> confirmedScenarios,
    Ref<String> decidedBy,
    Instant decidedAt,
    String contentSha256) {
  public UnderstandingDecisionDescription {
    selectedDrafts = List.copyOf(selectedDrafts);
    confirmedScenarios = List.copyOf(confirmedScenarios);
  }
}
