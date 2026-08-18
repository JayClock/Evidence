package reengineering.ddd.evidence.persistent.associations;

import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Optional;
import reengineering.ddd.evidence.domain.model.Membership;
import reengineering.ddd.evidence.domain.model.User;
import reengineering.ddd.evidence.persistent.mappers.UserMembershipsMapper;

@AssociationMapping(entity = User.class, field = "memberships", parentIdField = "userId")
public final class UserMemberships extends EntityList<String, Membership>
    implements User.Memberships {
  private String userId;

  @Inject private UserMembershipsMapper mapper;

  @Override
  protected List<Membership> findEntities(int from, int to) {
    return mapper.findAll(userId, from, Math.max(to - from, 0));
  }

  @Override
  protected Membership findEntity(String id) {
    return mapper.findByIdentity(userId, id);
  }

  @Override
  public int size() {
    return mapper.countAll(userId);
  }

  @Override
  public Optional<Membership> findByWorkspaceIdentity(String workspaceId) {
    return Optional.ofNullable(mapper.findByWorkspaceIdentity(userId, workspaceId));
  }
}
