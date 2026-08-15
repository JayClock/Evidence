package reengineering.ddd.evidence.persistent;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.domain.DomainException;

@Component
public final class WorkspaceModelRoot {
  private static final Pattern SAFE_WORKSPACE_ID = Pattern.compile("^[a-zA-Z0-9][a-zA-Z0-9._-]*$");
  private static final Set<String> PRIVATE_METADATA_KEYS =
      Set.of("path", "rootPath", "repositoryRoot", "evidenceRoot");

  private final Path storageRoot;
  private final Path defaultWorkspaceRoot;

  public WorkspaceModelRoot(Environment environment) {
    storageRoot =
        Path.of(
                environment.getProperty(
                    "evidence.workspace-storage-root",
                    Path.of(System.getProperty("user.dir"), "tmp", "workspace-models").toString()))
            .toAbsolutePath()
            .normalize();
    defaultWorkspaceRoot =
        Path.of(
                environment.getProperty(
                    "evidence.default-workspace-path", System.getProperty("user.dir")))
            .toAbsolutePath()
            .normalize();
  }

  public String initializeWorkspace(String workspaceId) {
    if (!SAFE_WORKSPACE_ID.matcher(workspaceId).matches()) {
      throw DomainException.validation("unsafe workspace identity: " + workspaceId);
    }
    Path repositoryRoot = storageRoot.resolve(workspaceId).normalize();
    if (!repositoryRoot.startsWith(storageRoot)) {
      throw DomainException.validation("unsafe workspace identity: " + workspaceId);
    }
    return initializeRepository(repositoryRoot);
  }

  public String initializeDefaultWorkspace() {
    return initializeRepository(defaultWorkspaceRoot);
  }

  public Map<String, String> publicMetadata(Map<String, String> input) {
    return input.entrySet().stream()
        .filter(entry -> !PRIVATE_METADATA_KEYS.contains(entry.getKey()))
        .collect(
            java.util.stream.Collectors.toMap(
                Map.Entry::getKey,
                Map.Entry::getValue,
                (left, right) -> right,
                java.util.LinkedHashMap::new));
  }

  private String initializeRepository(Path requestedRoot) {
    try {
      Files.createDirectories(requestedRoot);
      Path repositoryRoot = requestedRoot.toRealPath();
      if (!Files.isDirectory(repositoryRoot)) {
        throw DomainException.validation(
            "workspace path " + repositoryRoot + " is not a directory");
      }
      Path evidenceRoot = repositoryRoot.resolve(".evidence");
      Files.createDirectories(evidenceRoot.resolve("entities"));
      Files.createDirectories(evidenceRoot.resolve("associations"));
      return evidenceRoot.toString();
    } catch (DomainException error) {
      throw error;
    } catch (IOException error) {
      throw DomainException.internal(
          "create workspace model root " + requestedRoot + ": " + error.getMessage());
    }
  }
}
