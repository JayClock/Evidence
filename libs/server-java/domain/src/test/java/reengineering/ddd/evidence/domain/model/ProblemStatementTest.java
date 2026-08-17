package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.ProblemStatementDescription;

class ProblemStatementTest {
  @Test
  void exposesIdentityAndDescription() {
    ProblemStatementDescription description =
        new ProblemStatementDescription(
            null, null, 1, "Title", "Problem", null, List.of(), "sha256:problem", null);

    ProblemStatement statement = new ProblemStatement("problem-1", description);

    assertEquals("problem-1", statement.getIdentity());
    assertSame(description, statement.getDescription());
  }
}
