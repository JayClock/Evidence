package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.util.List;

public record ScenarioDraftDescription(
    String reference,
    int position,
    Ref<String> proposal,
    String title,
    List<String> given,
    String when,
    List<String> then,
    List<String> businessData,
    String contentSha256) {
  public ScenarioDraftDescription {
    given = List.copyOf(given);
    then = List.copyOf(then);
    businessData = List.copyOf(businessData);
  }
}
