package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import jakarta.inject.Inject;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.domain.model.IterationIntake;
import reengineering.ddd.evidence.persistent.mappers.WorkflowMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkflowRows;

@AssociationMapping(entity = Iteration.class, field = "intake", parentIdField = "iterationId")
public final class IterationIntakeAssociation implements Iteration.Intake {
  private String iterationId;
  @Inject private WorkflowMapper mapper;
  @Inject private ObjectMapper objectMapper;

  public IterationIntakeAssociation() {}

  IterationIntakeAssociation(String iterationId, WorkflowMapper mapper, ObjectMapper objectMapper) {
    this.iterationId = iterationId;
    this.mapper = mapper;
    this.objectMapper = objectMapper;
  }

  @Override
  public IterationIntake get() {
    WorkflowRows.IntakeRow row = mapper.findIntake(iterationId);
    if (row == null) {
      throw DomainException.internal("Iteration " + iterationId + " lost its Intake");
    }
    return IterationEntities.intake(row, objectMapper);
  }
}
