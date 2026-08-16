package reengineering.ddd.evidence.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import reengineering.ddd.evidence.domain.model.Inbox;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;

class CanonicalJsonTest {
  @Test
  void matchesTheLanguageNeutralHashVectors() {
    assertEquals(
        "sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
        CanonicalJson.hash(null));
    assertEquals(
        "sha256:b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
        CanonicalJson.hash(true));
    assertEquals(
        "sha256:73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049",
        CanonicalJson.hash(42));
    assertEquals(
        "sha256:c79c03bd291a702d619dc33940e784a305af303cfe4dea80507cd7a167d2a4c8",
        CanonicalJson.hash("Evidence π 证据"));
    assertEquals(
        "sha256:14d74bcde1082123d818f0c5bd142db6d482a7cda25d9ee43163ee3f79e8e7db",
        CanonicalJson.hash(new LinkedHashMap<>(Map.of("second", 2, "first", 1))));
    Map<String, Object> nested = new LinkedHashMap<>();
    nested.put("beta", null);
    nested.put("alpha", "first");
    assertEquals(
        "sha256:b78ed9e427dea08249dbfa59af5b6a2f9b0250f31035b8346ee1f849502bfa8d",
        CanonicalJson.hash(Map.of("z", List.of(nested, 3), "a", Map.of("nested", true))));
    assertEquals(
        "sha256:02d8bc3008a9bb0dcc4b86d7fd3428ced792355c733c19756bec5a56dc61b2c5",
        CanonicalJson.hash(List.of("b", "a")));
  }

  @Test
  void canonicalizesRecordsUsedByExecutionAuthority() {
    record Authority(String action, int version, List<String> evidenceRefs) {}

    Authority authority = new Authority("approve", 3, List.of("pair:manifest"));
    assertEquals(
        CanonicalJson.hash(
            Map.of("action", "approve", "version", 3, "evidenceRefs", List.of("pair:manifest"))),
        CanonicalJson.hash(authority));
  }

  @Test
  void hashesNormalizedInboxSourcesLikeTheNestServer() {
    Inbox.HashedSource source =
        Inbox.normalizeAndHash(
            new Inbox.SourceInput(
                "manual_text",
                "capture-1",
                "Java Inbox migration",
                "Preserve exact Inbox evidence.",
                "text/markdown",
                null,
                Map.of("channel", "product"),
                null));

    assertEquals(
        "sha256:4bd53e2857bf6c550115373489b4e5271869400b81fed13a63b3045ba88c17f0",
        source.contentSha256());
  }

  @Test
  void hashesNormalizedInboxCandidatesLikeTheNestServer() {
    InboxWorkflow.CandidateData candidate =
        InboxWorkflow.normalizeCandidate(
            new InboxWorkflow.CandidateInput(
                " One Story ",
                "The intake must remain frozen.",
                "Workspace maintainer",
                "Start one bounded iteration.",
                "Changes remain traceable.",
                "complicated",
                List.of(
                    new InboxWorkflow.CitationInput(
                        "INBOX-0001",
                        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        "whole-source"))));

    String candidateSha256 = InboxWorkflow.hashCandidate(candidate).contentSha256();
    assertEquals(
        "sha256:2c80f6eabbd76afd6f9bba32a01ff600a10ef8e3deff03d6c41f6792174030e3", candidateSha256);
    InboxWorkflow.HashedDecision decision =
        InboxWorkflow.hashDecision(
            "candidate-1",
            candidateSha256,
            InboxWorkflow.DecisionAction.DEFER,
            " Not now. ",
            "user-1",
            Instant.parse("2026-01-01T00:00:00Z"));
    assertEquals("Not now.", decision.reason());
    assertEquals(
        "sha256:2bed57979dcc1a1d55d0c85ae50225bfb4b261481ecdb08702cae2ab8eea55b4",
        decision.contentSha256());
  }
}
