package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import reengineering.ddd.evidence.domain.model.Delivery;

public record StoryDescription(
    Ref<String> workspace,
    Ref<String> iteration,
    String iterationReference,
    String iterationLifecycle,
    String iterationLoop,
    String iterationStage,
    String title,
    String goal,
    Ref<String> latestRevision,
    int latestRevisionNumber,
    int latestScenarioCount,
    int latestCitationCount,
    String pendingClarificationReference,
    Delivery.Authority authority,
    int revisionCount,
    int version,
    Instant createdAt,
    Instant updatedAt) {}
