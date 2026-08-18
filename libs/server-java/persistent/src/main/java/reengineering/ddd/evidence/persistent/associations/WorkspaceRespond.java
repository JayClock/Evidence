package reengineering.ddd.evidence.persistent.associations;

import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import jakarta.inject.Inject;
import java.util.Optional;
import reengineering.ddd.evidence.domain.model.Respond;
import reengineering.ddd.evidence.domain.model.Workspace;

@AssociationMapping(entity = Workspace.class, field = "respond", parentIdField = "workspaceId")
public final class WorkspaceRespond implements Workspace.RespondAssociation {
  private String workspaceId;
  @Inject private RespondStore store;

  @Override
  public Optional<Respond.View> findRespond(String iterationId) {
    return Optional.ofNullable(store.find(workspaceId, iterationId));
  }

  @Override
  public Respond.ActionResult proposeRespondCandidate(
      String iterationId, Respond.ProposeInput input) {
    return store.propose(workspaceId, iterationId, input);
  }

  @Override
  public Respond.ActionResult decideRespond(
      String iterationId, Respond.DecideInput input, String decidedByUserId) {
    return store.decide(workspaceId, iterationId, input, decidedByUserId);
  }
}
