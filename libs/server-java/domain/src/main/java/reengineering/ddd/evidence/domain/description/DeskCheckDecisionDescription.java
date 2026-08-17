package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import reengineering.ddd.evidence.domain.model.Tasking;

public record DeskCheckDecisionDescription(
    String reference,
    Ref<String> iteration,
    Ref<String> candidate,
    String candidateSha256,
    Tasking.DeskCheckAction action,
    String reason,
    Ref<String> decidedBy,
    Instant decidedAt,
    String contentSha256) {}
