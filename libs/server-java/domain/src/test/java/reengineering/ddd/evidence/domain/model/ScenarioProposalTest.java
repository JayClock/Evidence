package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.ScenarioProposalDescription;

class ScenarioProposalTest {
  @Test
  void exposesIdentityAndDescription() {
    ScenarioProposalDescription description =
        new ScenarioProposalDescription(
            "PROP-001", null, null, null, 1, List.of(), null, "sha256:proposal");

    ScenarioProposal proposal = new ScenarioProposal("proposal-1", description);

    assertEquals("proposal-1", proposal.getIdentity());
    assertSame(description, proposal.getDescription());
  }
}
