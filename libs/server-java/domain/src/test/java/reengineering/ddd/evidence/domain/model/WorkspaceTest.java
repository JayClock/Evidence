package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;

class WorkspaceTest {
  @Test
  void exposesIdentityAndDescription() {
    Instant now = Instant.parse("2026-01-01T00:00:00Z");
    WorkspaceDescription description =
        new WorkspaceDescription("Evidence", "Domain model", "active", Map.of(), now, now);

    Workspace workspace =
        new Workspace(
            "workspace-1", description, null, null, null, null, null, null, null, null, null);

    assertEquals("workspace-1", workspace.getIdentity());
    assertSame(description, workspace.getDescription());
  }
}
