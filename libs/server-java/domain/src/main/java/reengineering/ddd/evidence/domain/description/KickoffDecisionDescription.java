package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;

public record KickoffDecisionDescription(
    String reference,
    Ref<String> iteration,
    Ref<String> proposal,
    String proposalSha256,
    IterationWorkflow.KickoffAction action,
    String reason,
    Ref<String> decidedBy,
    Instant decidedAt,
    String contentSha256) {}
