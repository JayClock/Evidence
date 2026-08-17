package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.ProblemStatementDescription;

public final class ProblemStatement implements Entity<String, ProblemStatementDescription> {
  private final String identity;
  private final ProblemStatementDescription description;

  public ProblemStatement(String identity, ProblemStatementDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public ProblemStatementDescription getDescription() {
    return description;
  }
}
