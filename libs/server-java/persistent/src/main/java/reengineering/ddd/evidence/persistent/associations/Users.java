package reengineering.ddd.evidence.persistent.associations;

import jakarta.inject.Inject;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.domain.description.UserDescription;
import reengineering.ddd.evidence.domain.model.User;
import reengineering.ddd.evidence.domain.model.Users.ExternalIdentity;
import reengineering.ddd.evidence.domain.model.Users.ExternalIdentityKey;
import reengineering.ddd.evidence.domain.model.Users.UserMemberships;
import reengineering.ddd.evidence.domain.model.Users.Workspaces;
import reengineering.ddd.evidence.persistent.mappers.UserMembershipsMapper;
import reengineering.ddd.evidence.persistent.mappers.UsersMapper;

@Component
public class Users implements reengineering.ddd.evidence.domain.model.Users {
  private final UsersMapper mapper;
  private final reengineering.ddd.evidence.persistent.associations.Workspaces workspaces;
  private final UserMembershipsMapper membershipsMapper;
  private final Clock clock;

  @Inject
  public Users(
      UsersMapper mapper,
      reengineering.ddd.evidence.persistent.associations.Workspaces workspaces,
      UserMembershipsMapper membershipsMapper,
      Clock clock) {
    this.mapper = mapper;
    this.workspaces = workspaces;
    this.membershipsMapper = membershipsMapper;
    this.clock = clock;
  }

  @Override
  public Workspaces workspaces() {
    return workspaces;
  }

  @Override
  public UserMemberships memberships(String userId) {
    return new reengineering.ddd.evidence.persistent.associations.UserMemberships(
        membershipsMapper, userId);
  }

  @Override
  public Optional<User> findByIdentity(String userId) {
    return Optional.ofNullable(mapper.findByIdentity(userId));
  }

  @Override
  public Optional<User> findByExternalIdentity(ExternalIdentityKey identity) {
    return Optional.ofNullable(
        mapper.findByExternalIdentity(identity.issuer(), identity.subject()));
  }

  @Override
  public User provisionExternalIdentity(ExternalIdentity identity) {
    mapper.lockExternalIdentity(identity.issuer(), identity.subject());
    Optional<User> existing = findByExternalIdentity(identity.key());
    if (existing.isPresent()) return existing.orElseThrow();

    String userId = UUID.randomUUID().toString();
    mapper.insertUser(userId, new UserDescription(identity.name(), identity.email()));
    mapper.insertIdentity(
        UUID.randomUUID().toString(),
        userId,
        identity.issuer(),
        identity.subject(),
        clock.instant().truncatedTo(ChronoUnit.MILLIS));
    return findByIdentity(userId).orElseThrow();
  }
}
