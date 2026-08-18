package reengineering.ddd.evidence.persistent.associations;

import io.github.jayclock.smartdomain.core.Ref;
import reengineering.ddd.evidence.domain.description.IterationDescription;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;

final class IterationEntities {
  private IterationEntities() {}

  static Iteration iteration(InboxRows.IterationRow row) {
    return new Iteration(
        row.id(),
        new IterationDescription(
            row.reference(),
            new Ref<>(row.workspaceId()),
            new Ref<>(row.sourceCandidateId()),
            row.sourceCandidateSha256(),
            row.lifecycle(),
            row.loop(),
            row.stage(),
            row.lane(),
            row.version(),
            row.baseCommitSha(),
            row.branchName(),
            row.provisioningFailureSummary(),
            row.activeStoryId() == null ? null : new Ref<>(row.activeStoryId()),
            new Ref<>(row.admittedByUserId()),
            row.admittedAt(),
            row.updatedAt()));
  }
}
