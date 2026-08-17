package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.LogicalEntityDescription;

public final class LogicalEntity implements Entity<String, LogicalEntityDescription> {
  private static final Map<LogicalEntityDescription.Type, List<String>> VALID_SUB_TYPES =
      Map.of(
          LogicalEntityDescription.Type.EVIDENCE,
          List.of(
              "rfp",
              "proposal",
              "contract",
              "fulfillment_request",
              "fulfillment_confirmation",
              "other_evidence"),
          LogicalEntityDescription.Type.PARTICIPANT,
          List.of("party", "thing"),
          LogicalEntityDescription.Type.ROLE,
          List.of("party", "domain", "3rd system", "context", "evidence"),
          LogicalEntityDescription.Type.CONTEXT,
          List.of("bounded_context"));

  private final String identity;
  private final LogicalEntityDescription description;

  public LogicalEntity(String identity, LogicalEntityDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public LogicalEntityDescription getDescription() {
    return description;
  }

  public static LogicalEntityDescription.Type parseType(String value) {
    if (value == null) throw DomainException.validation("logical entity type is required");
    return switch (value.trim()) {
      case "EVIDENCE", "Evidence", "evidence" -> LogicalEntityDescription.Type.EVIDENCE;
      case "PARTICIPANT", "Participant", "participant" -> LogicalEntityDescription.Type.PARTICIPANT;
      case "ROLE", "Role", "role" -> LogicalEntityDescription.Type.ROLE;
      case "CONTEXT", "Context", "context" -> LogicalEntityDescription.Type.CONTEXT;
      default -> throw DomainException.validation("unknown logical entity type: " + value);
    };
  }

  public static String normalizeSubType(LogicalEntityDescription.Type type, String value) {
    if (value == null || value.trim().isEmpty()) return null;
    String normalized = value.trim();
    if (normalized.contains(":")) {
      int separator = normalized.indexOf(':');
      String prefix = normalized.substring(0, separator).trim();
      if (!prefix.equals(type.name())) {
        throw DomainException.validation(
            "subType prefix " + prefix + " does not match logical entity type " + type.name());
      }
      normalized = normalized.substring(separator + 1).trim();
    }
    String requested = normalized;
    String candidate = requested.toLowerCase(Locale.ROOT);
    return VALID_SUB_TYPES.get(type).stream()
        .filter(valueCandidate -> valueCandidate.toLowerCase(Locale.ROOT).equals(candidate))
        .findFirst()
        .orElseThrow(
            () -> DomainException.validation("unknown " + type.name() + " subType: " + requested));
  }

  public static String formatSubType(LogicalEntityDescription.Type type, String subType) {
    return subType == null ? null : type.name() + ":" + subType;
  }
}
