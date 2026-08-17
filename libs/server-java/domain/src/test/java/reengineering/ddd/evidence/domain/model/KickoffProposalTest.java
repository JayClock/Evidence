package reengineering.ddd.evidence.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.description.KickoffProposalDescription;

class KickoffProposalTest {
  @Test
  void exposesIdentityAndDescription() {
    KickoffProposalDescription description =
        new KickoffProposalDescription(
            "PROP-001",
            null,
            1,
            IterationWorkflow.ProposalOrigin.REQUIREMENTS_ANALYST,
            "Title",
            "Problem",
            "Role",
            "Goal",
            "Value",
            null,
            List.of(),
            "sha256:proposal",
            null);

    KickoffProposal proposal = new KickoffProposal("proposal-1", description);

    assertEquals("proposal-1", proposal.getIdentity());
    assertSame(description, proposal.getDescription());
  }
}
