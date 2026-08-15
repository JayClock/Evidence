package reengineering.ddd.evidence.domain.description;

import java.time.Instant;
import java.util.Map;

public record WorkspaceDescription(
    String title,
    String description,
    String status,
    Map<String, String> metadata,
    Instant createdAt,
    Instant updatedAt) {
  public WorkspaceDescription {
    metadata = Map.copyOf(metadata);
  }
}
