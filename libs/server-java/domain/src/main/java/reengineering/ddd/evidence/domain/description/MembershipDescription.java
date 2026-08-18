package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;

public record MembershipDescription(
    Ref<String> workspace, Ref<String> user, String role, Instant createdAt, Instant updatedAt) {}
