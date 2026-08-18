package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import jakarta.inject.Inject;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;
import reengineering.ddd.evidence.persistent.mappers.WorkflowMapper;

@AssociationMapping(entity = Iteration.class, field = "provisioning", parentIdField = "iterationId")
public final class IterationProvisioning implements Iteration.Provisioning {
  private String iterationId;
  @Inject private WorkflowMapper mapper;
  @Inject private ObjectMapper objectMapper;
  @Inject private Clock clock;

  public IterationProvisioning() {}

  IterationProvisioning(
      String iterationId, WorkflowMapper mapper, ObjectMapper objectMapper, Clock clock) {
    this.iterationId = iterationId;
    this.mapper = mapper;
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  @Override
  public Iteration complete(IterationWorkflow.CompleteProvisioningInput input) {
    InboxRows.IterationRow current = requireIteration();
    if (!"provisioning".equals(current.lifecycle())) {
      throw DomainException.conflict("Iteration " + iterationId + " is not awaiting provisioning");
    }
    if (!current.baseCommitSha().equals(input.baseCommitSha())) {
      throw DomainException.conflict(
          "Iteration " + iterationId + " base commit does not match its frozen admission");
    }
    if (mapper.completeProvisioning(
            current.workspaceId(),
            iterationId,
            input.expectedVersion(),
            input.baseCommitSha(),
            input.branchName(),
            timestamp())
        != 1) {
      changed();
    }
    return reload();
  }

  @Override
  public Iteration fail(IterationWorkflow.FailProvisioningInput input) {
    InboxRows.IterationRow current = requireIteration();
    if (mapper.failProvisioning(
            current.workspaceId(),
            iterationId,
            input.expectedVersion(),
            input.reason(),
            timestamp())
        != 1) {
      throw DomainException.conflict(
          "Iteration " + iterationId + " is not awaiting provisioning or has changed");
    }
    return reload();
  }

  private InboxRows.IterationRow requireIteration() {
    InboxRows.IterationRow row = mapper.findIterationByIdentity(iterationId);
    if (row == null) {
      throw DomainException.notFound("Iteration " + iterationId + " not found");
    }
    return row;
  }

  private Iteration reload() {
    InboxRows.IterationRow row = requireIteration();
    return IterationEntities.iteration(
        row,
        new IterationIntakeAssociation(iterationId, mapper, objectMapper),
        new IterationProvisioning(iterationId, mapper, objectMapper, clock));
  }

  private void changed() {
    throw DomainException.conflict("Iteration " + iterationId + " has changed");
  }

  private Instant timestamp() {
    return clock.instant().truncatedTo(ChronoUnit.MILLIS);
  }
}
