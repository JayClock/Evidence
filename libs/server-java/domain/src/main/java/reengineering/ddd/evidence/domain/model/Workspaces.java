package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.HasMany;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;

public interface Workspaces extends HasMany<String, Workspace> {
  Workspace create(String ownerUserId, WorkspaceDescription description);

  Workspace update(String workspaceId, WorkspaceDescription description);

  void delete(String workspaceId);
}
