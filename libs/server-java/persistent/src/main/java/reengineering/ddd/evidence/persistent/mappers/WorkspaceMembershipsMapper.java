package reengineering.ddd.evidence.persistent.mappers;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.evidence.domain.description.MembershipDescription;
import reengineering.ddd.evidence.domain.model.Membership;

@Mapper
public interface WorkspaceMembershipsMapper {
  Membership findByIdentity(
      @Param("workspaceId") String workspaceId, @Param("membershipId") String membershipId);

  List<Membership> findAll(
      @Param("workspaceId") String workspaceId, @Param("from") int from, @Param("size") int size);

  int countAll(@Param("workspaceId") String workspaceId);

  int countOwners(@Param("workspaceId") String workspaceId);

  int insert(
      @Param("id") String id,
      @Param("workspaceId") String workspaceId,
      @Param("description") MembershipDescription description,
      @Param("timestamp") Instant timestamp);

  int update(
      @Param("workspaceId") String workspaceId,
      @Param("membershipId") String membershipId,
      @Param("role") String role,
      @Param("updatedAt") Instant updatedAt);

  int delete(@Param("workspaceId") String workspaceId, @Param("membershipId") String membershipId);

  int ensureOwner(
      @Param("id") String id,
      @Param("workspaceId") String workspaceId,
      @Param("userId") String userId,
      @Param("timestamp") Instant timestamp);
}
