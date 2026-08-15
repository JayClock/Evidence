package reengineering.ddd.evidence.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.application.LocalInstallation;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.infrastructure.security.EvidenceSecuritySettings;

@Component
public final class LocalInstallationRunner implements ApplicationRunner {
  private final EvidenceSecuritySettings security;
  private final WorkspaceService workspaces;
  private final Environment environment;

  public LocalInstallationRunner(
      EvidenceSecuritySettings security, WorkspaceService workspaces, Environment environment) {
    this.security = security;
    this.workspaces = workspaces;
    this.environment = environment;
  }

  @Override
  public void run(ApplicationArguments arguments) {
    if (security.authMode() != EvidenceSecuritySettings.AuthenticationMode.LOCAL) return;
    workspaces.initializeLocalInstallation(
        new LocalInstallation.Description(
            security.userId(),
            environment.getProperty("evidence.user-name", "Desktop User").trim(),
            environment.getProperty("evidence.user-email", "desktop@evidence.local").trim()));
  }
}
