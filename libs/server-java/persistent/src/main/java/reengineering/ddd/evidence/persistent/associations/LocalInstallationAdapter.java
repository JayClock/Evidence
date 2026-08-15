package reengineering.ddd.evidence.persistent.associations;

import jakarta.inject.Inject;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.application.LocalInstallation;
import reengineering.ddd.evidence.domain.description.UserDescription;
import reengineering.ddd.evidence.persistent.WorkspaceModelRoot;
import reengineering.ddd.evidence.persistent.mappers.UsersMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkspaceMembersMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkspacesMapper;

@Component
public class LocalInstallationAdapter implements LocalInstallation {
  private static final String DEFAULT_WORKSPACE_ID = "default-workspace";

  private final UsersMapper users;
  private final WorkspacesMapper workspaces;
  private final WorkspaceMembersMapper members;
  private final WorkspaceModelRoot modelRoots;
  private final Clock clock;

  @Inject
  public LocalInstallationAdapter(
      UsersMapper users,
      WorkspacesMapper workspaces,
      WorkspaceMembersMapper members,
      WorkspaceModelRoot modelRoots,
      Clock clock) {
    this.users = users;
    this.workspaces = workspaces;
    this.members = members;
    this.modelRoots = modelRoots;
    this.clock = clock;
  }

  @Override
  public void initialize(Description description) {
    Instant timestamp = clock.instant().truncatedTo(ChronoUnit.MILLIS);
    users.ensureUser(
        description.userId(), new UserDescription(description.userName(), description.userEmail()));
    workspaces.ensureDefault(
        DEFAULT_WORKSPACE_ID,
        "Default Workspace",
        "Seed workspace for local desktop usage",
        modelRoots.initializeDefaultWorkspace(),
        timestamp);
    String memberId =
        "desktop-user".equals(description.userId())
            ? "default-workspace-owner"
            : "default-workspace-owner-" + description.userId();
    members.ensureOwner(memberId, DEFAULT_WORKSPACE_ID, description.userId(), timestamp);
  }
}
