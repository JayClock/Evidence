package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;

public record IterationDescription(
    String reference,
    Ref<String> workspace,
    Ref<String> sourceCandidate,
    String sourceCandidateSha256,
    String lifecycle,
    String loop,
    String stage,
    String lane,
    int version,
    String baseCommitSha,
    String branchName,
    String provisioningFailureSummary,
    Ref<String> activeStory,
    Ref<String> admittedBy,
    Instant admittedAt,
    Instant updatedAt) {}
