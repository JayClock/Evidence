package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import reengineering.ddd.evidence.domain.model.ScenarioDraft;

public record ScenarioProposalDescription(
    String reference,
    Ref<String> iteration,
    Ref<String> story,
    Ref<String> storyRevision,
    int sequence,
    List<ScenarioDraft> drafts,
    Instant proposedAt,
    String contentSha256) {
  public ScenarioProposalDescription {
    drafts = List.copyOf(drafts);
  }
}
