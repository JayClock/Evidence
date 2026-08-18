package reengineering.ddd.evidence.persistent.mappers;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;
import reengineering.ddd.evidence.domain.model.Workspace;

@Mapper
public interface WorkspacesMapper {
  Workspace findByIdentity(@Param("id") String id);

  Workspace findAccessibleByIdentity(@Param("userId") String userId, @Param("id") String id);

  String findModelRoot(@Param("id") String id);

  List<Workspace> findAllAccessible(
      @Param("userId") String userId, @Param("from") int from, @Param("size") int size);

  int countAllAccessible(@Param("userId") String userId);

  int insert(
      @Param("id") String id,
      @Param("description") WorkspaceDescription description,
      @Param("modelRoot") String modelRoot,
      @Param("timestamp") Instant timestamp);

  int update(
      @Param("id") String id,
      @Param("description") WorkspaceDescription description,
      @Param("updatedAt") Instant updatedAt);

  int softDelete(@Param("id") String id, @Param("deletedAt") Instant deletedAt);

  int ensureDefault(
      @Param("id") String id,
      @Param("title") String title,
      @Param("description") String description,
      @Param("modelRoot") String modelRoot,
      @Param("timestamp") Instant timestamp);
}
