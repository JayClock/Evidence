package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Many;
import java.util.Optional;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;

public interface Workspaces {
  Many<Workspace> findAll(String userId);

  Optional<Workspace> findByIdentity(String userId, String workspaceId);

  Workspace create(String ownerUserId, WorkspaceDescription description);

  Workspace update(String workspaceId, WorkspaceDescription description);

  void delete(String workspaceId);
}
