package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;

public record ApprovedTaskingPlanDescription(
    Ref<String> iteration,
    Ref<String> story,
    Ref<String> storyRevision,
    Ref<String> taskingCandidate,
    Ref<String> deskCheckDecision,
    TaskingPlanCandidateDescription plan,
    String contentSha256,
    Ref<String> approvedBy,
    Instant approvedAt) {}
