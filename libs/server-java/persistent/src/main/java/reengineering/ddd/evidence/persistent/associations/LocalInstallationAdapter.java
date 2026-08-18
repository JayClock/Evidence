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
import reengineering.ddd.evidence.persistent.mappers.WorkspaceMembershipsMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkspacesMapper;

@Component
public class LocalInstallationAdapter implements LocalInstallation {
  private static final String DEFAULT_WORKSPACE_ID = "default-workspace";

  private final UsersMapper users;
  private final WorkspacesMapper workspaces;
  private final WorkspaceMembershipsMapper memberships;
  private final WorkspaceModelRoot modelRoots;
  private final Clock clock;

  @Inject
  public LocalInstallationAdapter(
      UsersMapper users,
      WorkspacesMapper workspaces,
      WorkspaceMembershipsMapper memberships,
      WorkspaceModelRoot modelRoots,
      Clock clock) {
    this.users = users;
    this.workspaces = workspaces;
    this.memberships = memberships;
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
    String membershipId =
        "desktop-user".equals(description.userId())
            ? "default-workspace-owner-membership"
            : "default-workspace-owner-membership-" + description.userId();
    memberships.ensureOwner(membershipId, DEFAULT_WORKSPACE_ID, description.userId(), timestamp);
  }
}
