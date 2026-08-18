package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasOne;
import reengineering.ddd.evidence.domain.description.IterationDescription;

public final class Iteration implements Entity<String, IterationDescription> {
  private String identity;
  private IterationDescription description;
  private Intake intake;

  public Iteration(String identity, IterationDescription description, Intake intake) {
    this.identity = identity;
    this.description = description;
    this.intake = intake;
  }

  private Iteration() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public IterationDescription getDescription() {
    return description;
  }

  public HasOne<IterationIntake> intake() {
    return intake;
  }

  public interface Intake extends HasOne<IterationIntake> {}
}
