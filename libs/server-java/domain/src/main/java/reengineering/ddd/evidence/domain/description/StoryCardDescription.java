package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;

public record StoryCardDescription(
    Ref<String> iteration,
    Ref<String> story,
    int revisionNumber,
    String title,
    String role,
    String goal,
    String value,
    Ref<String> problemStatement,
    String contentSha256,
    Instant createdAt) {}
