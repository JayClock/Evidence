package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;

public final class Iteration implements Entity<String, Iteration.Description> {
  private final String identity;
  private final Description description;

  public Iteration(String identity, Description description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public Description getDescription() {
    return description;
  }

  public record Description(
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
}
