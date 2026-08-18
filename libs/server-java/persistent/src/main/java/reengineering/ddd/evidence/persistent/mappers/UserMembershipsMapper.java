package reengineering.ddd.evidence.persistent.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.evidence.domain.model.Membership;

@Mapper
public interface UserMembershipsMapper {
  List<Membership> findAll(
      @Param("userId") String userId, @Param("from") int from, @Param("size") int size);

  int countAll(@Param("userId") String userId);

  Membership findByIdentity(
      @Param("userId") String userId, @Param("membershipId") String membershipId);

  Membership findByWorkspaceIdentity(
      @Param("userId") String userId, @Param("workspaceId") String workspaceId);
}
