package reengineering.ddd.evidence.persistent.associations;

import io.github.jayclock.smartdomain.core.Ref;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.MembershipDescription;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.persistent.WorkspaceModelRoot;
import reengineering.ddd.evidence.persistent.mappers.WorkspaceMembershipsMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkspacesMapper;

@Component
public class Workspaces extends EntityList<String, Workspace>
    implements reengineering.ddd.evidence.domain.model.Workspaces {
  private final WorkspacesMapper mapper;
  private final WorkspaceMembershipsMapper membershipsMapper;
  private final WorkspaceModelRoot modelRoots;
  private final Clock clock;

  @Inject
  public Workspaces(
      WorkspacesMapper mapper,
      WorkspaceMembershipsMapper membershipsMapper,
      WorkspaceModelRoot modelRoots,
      Clock clock) {
    this.mapper = mapper;
    this.membershipsMapper = membershipsMapper;
    this.modelRoots = modelRoots;
    this.clock = clock;
  }

  @Override
  protected List<Workspace> findEntities(int from, int to) {
    return mapper.findAll(from, Math.max(to - from, 0));
  }

  @Override
  protected Workspace findEntity(String id) {
    return mapper.findByIdentity(id);
  }

  @Override
  public int size() {
    return mapper.countAll();
  }

  @Override
  public Workspace create(String ownerUserId, WorkspaceDescription description) {
    String id = UUID.randomUUID().toString();
    Instant timestamp = timestamp();
    WorkspaceDescription normalized = normalize(description, null, timestamp);
    mapper.insert(id, normalized, modelRoots.initializeWorkspace(id), timestamp);
    membershipsMapper.insert(
        UUID.randomUUID().toString(),
        id,
        new MembershipDescription(
            new Ref<>(id), new Ref<>(ownerUserId), "owner", timestamp, timestamp),
        timestamp);
    return require(id);
  }

  @Override
  public Workspace update(String workspaceId, WorkspaceDescription description) {
    Workspace current = require(workspaceId);
    WorkspaceDescription normalized = normalize(description, current.getDescription(), timestamp());
    if (mapper.update(workspaceId, normalized, normalized.updatedAt()) != 1) {
      throw DomainException.notFound("workspace " + workspaceId + " not found");
    }
    return require(workspaceId);
  }

  @Override
  public void delete(String workspaceId) {
    require(workspaceId);
    if (mapper.softDelete(workspaceId, timestamp()) != 1) {
      throw DomainException.notFound("workspace " + workspaceId + " not found");
    }
  }

  private Workspace require(String workspaceId) {
    return findByIdentity(workspaceId)
        .orElseThrow(() -> DomainException.notFound("workspace " + workspaceId + " not found"));
  }

  private WorkspaceDescription normalize(
      WorkspaceDescription input, WorkspaceDescription current, Instant timestamp) {
    String title = input.title() == null ? "" : input.title().trim();
    if (title.isEmpty()) {
      throw DomainException.validation("workspace title must not be empty");
    }
    String normalizedStatus = input.status() == null ? "" : input.status().trim();
    String status = normalizedStatus.isEmpty() ? "active" : normalizedStatus;
    Map<String, String> metadata =
        input.metadata().isEmpty() && current != null ? current.metadata() : input.metadata();
    return new WorkspaceDescription(
        title,
        input.description(),
        status,
        modelRoots.publicMetadata(metadata),
        current == null ? timestamp : current.createdAt(),
        timestamp);
  }

  private Instant timestamp() {
    return clock.instant().truncatedTo(ChronoUnit.MILLIS);
  }
}
