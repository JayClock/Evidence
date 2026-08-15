package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;

public final class WorkspaceRequest {
  private static final Set<String> PRIVATE_PATHS =
      Set.of("path", "rootPath", "repositoryRoot", "evidenceRoot");

  private String title;
  private String description;
  private String status;
  private Map<String, String> metadata = Map.of();
  private final Map<String, Object> additional = new LinkedHashMap<>();

  public WorkspaceRequest() {}

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Map<String, String> getMetadata() {
    return metadata;
  }

  public void setMetadata(Map<String, String> metadata) {
    this.metadata = metadata == null ? Map.of() : metadata;
  }

  @JsonAnySetter
  public void additional(String name, Object value) {
    additional.put(name, value);
  }

  public WorkspaceDescription toDescription() {
    if (additional.containsKey("path")
        || metadata.keySet().stream().anyMatch(PRIVATE_PATHS::contains)) {
      throw DomainException.validation("local repository paths must be bound by the Desktop app");
    }
    return new WorkspaceDescription(
        title == null ? "" : title,
        description,
        status == null ? "active" : status,
        metadata,
        Instant.EPOCH,
        Instant.EPOCH);
  }
}
