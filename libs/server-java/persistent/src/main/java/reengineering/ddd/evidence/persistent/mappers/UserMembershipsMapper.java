package reengineering.ddd.evidence.persistent.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserMembershipsMapper {
  List<MembershipProjection> findAll(
      @Param("userId") String userId, @Param("from") int from, @Param("size") int size);

  int countAll(@Param("userId") String userId);

  MembershipProjection findByWorkspaceIdentity(
      @Param("userId") String userId, @Param("workspaceId") String workspaceId);
}
