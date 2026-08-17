package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.Map;
import reengineering.ddd.evidence.domain.model.Diagram;

public record DiagramNodeDescription(
    Ref<String> diagram,
    String kind,
    Ref<String> logicalEntity,
    Ref<String> parent,
    Diagram.Position position,
    Double width,
    Double height,
    Map<String, Object> data,
    Instant createdAt,
    Instant updatedAt) {
  public DiagramNodeDescription {
    data = Map.copyOf(data);
  }
}
