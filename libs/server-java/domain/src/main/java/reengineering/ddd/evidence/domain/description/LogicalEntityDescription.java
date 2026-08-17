package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;

public record LogicalEntityDescription(
    Ref<String> workspace,
    Type type,
    String subType,
    String name,
    String label,
    String description,
    List<Attribute> attributes,
    Instant createdAt,
    Instant updatedAt) {
  public LogicalEntityDescription {
    attributes = attributes == null ? List.of() : List.copyOf(attributes);
  }

  public enum Type {
    EVIDENCE,
    PARTICIPANT,
    ROLE,
    CONTEXT
  }

  public record Attribute(String id, String name, String label, String type, String description) {}
}
