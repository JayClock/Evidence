package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import reengineering.ddd.evidence.domain.model.Understanding;

public record ClarificationDescription(
    String reference,
    Ref<String> iteration,
    Ref<String> story,
    Ref<String> storyRevision,
    int sequence,
    Understanding.ClarificationTarget target,
    String question,
    Understanding.ClarificationStatus status,
    Instant askedAt,
    String answer,
    Ref<String> answeredBy,
    Instant answeredAt,
    String waivedReason,
    Ref<String> waivedBy,
    Instant waivedAt,
    String contentSha256) {}
