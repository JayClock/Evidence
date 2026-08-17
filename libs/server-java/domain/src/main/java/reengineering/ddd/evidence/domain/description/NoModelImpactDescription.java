package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;

public record NoModelImpactDescription(
    String reference,
    Ref<String> iteration,
    Ref<String> story,
    Ref<String> storyRevision,
    String storyRevisionSha256,
    String reason,
    Ref<String> decidedBy,
    Instant decidedAt,
    String contentSha256) {}
