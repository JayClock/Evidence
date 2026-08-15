package reengineering.ddd.evidence.persistent.mappers;

import java.time.Instant;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.evidence.domain.description.UserDescription;
import reengineering.ddd.evidence.domain.model.User;

@Mapper
public interface UsersMapper {
  User findByIdentity(@Param("id") String id);

  User findByExternalIdentity(@Param("issuer") String issuer, @Param("subject") String subject);

  long lockExternalIdentity(@Param("issuer") String issuer, @Param("subject") String subject);

  int insertUser(@Param("id") String id, @Param("description") UserDescription description);

  int insertIdentity(
      @Param("id") String id,
      @Param("userId") String userId,
      @Param("issuer") String issuer,
      @Param("subject") String subject,
      @Param("createdAt") Instant createdAt);

  int ensureUser(@Param("id") String id, @Param("description") UserDescription description);
}
