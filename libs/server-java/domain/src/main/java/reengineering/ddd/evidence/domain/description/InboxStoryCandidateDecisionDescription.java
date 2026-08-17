package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;

public record InboxStoryCandidateDecisionDescription(
    String reference,
    Ref<String> workspace,
    Ref<String> candidate,
    String candidateSha256,
    InboxWorkflow.DecisionAction action,
    String reason,
    Ref<String> decidedBy,
    Instant decidedAt,
    String contentSha256) {}
