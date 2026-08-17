package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import reengineering.ddd.evidence.domain.model.Inbox;

public record InboxItemDescription(
    Ref<String> workspace,
    String sourceKind,
    String externalKey,
    String title,
    Inbox.ItemStatus status,
    String latestRevisionId,
    String latestRevisionSha256,
    int revisionCount,
    int version,
    Instant createdAt,
    Instant updatedAt) {}
