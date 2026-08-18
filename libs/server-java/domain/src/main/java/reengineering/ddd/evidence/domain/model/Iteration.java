package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasOne;
import reengineering.ddd.evidence.domain.description.IterationDescription;

public final class Iteration implements Entity<String, IterationDescription> {
  private String identity;
  private IterationDescription description;
  private Intake intake;
  private Provisioning provisioning;

  public Iteration(
      String identity, IterationDescription description, Intake intake, Provisioning provisioning) {
    this.identity = identity;
    this.description = description;
    this.intake = intake;
    this.provisioning = provisioning;
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

  public Iteration completeProvisioning(IterationWorkflow.CompleteProvisioningInput input) {
    return provisioning.complete(IterationWorkflow.normalize(input));
  }

  public Iteration failProvisioning(IterationWorkflow.FailProvisioningInput input) {
    return provisioning.fail(IterationWorkflow.normalize(input));
  }

  public interface Intake extends HasOne<IterationIntake> {}

  public interface Provisioning {
    Iteration complete(IterationWorkflow.CompleteProvisioningInput input);

    Iteration fail(IterationWorkflow.FailProvisioningInput input);
  }
}
