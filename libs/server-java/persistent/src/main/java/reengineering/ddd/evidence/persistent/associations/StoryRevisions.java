package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.util.List;
import reengineering.ddd.evidence.domain.model.Story;
import reengineering.ddd.evidence.domain.model.StoryRevision;
import reengineering.ddd.evidence.persistent.mappers.WorkflowMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkflowRows;

@AssociationMapping(entity = Story.class, field = "revisions", parentIdField = "storyId")
public final class StoryRevisions extends EntityList<String, StoryRevision>
    implements Story.Revisions {
  private String storyId;
  @Inject private WorkflowMapper mapper;
  @Inject private ObjectMapper objectMapper;

  public StoryRevisions() {}

  StoryRevisions(String storyId, WorkflowMapper mapper, ObjectMapper objectMapper) {
    this.storyId = storyId;
    this.mapper = mapper;
    this.objectMapper = objectMapper;
  }

  @Override
  protected List<StoryRevision> findEntities(int from, int to) {
    return mapper.findStoryRevisionsByStory(storyId, from, Math.max(to - from, 0)).stream()
        .map(this::revision)
        .toList();
  }

  @Override
  protected StoryRevision findEntity(String revisionId) {
    WorkflowRows.StoryRevisionRow row = mapper.findStoryRevisionByStory(storyId, revisionId);
    return row == null ? null : revision(row);
  }

  @Override
  public int size() {
    return mapper.countStoryRevisionsByStory(storyId);
  }

  private StoryRevision revision(WorkflowRows.StoryRevisionRow row) {
    return StoryEntities.revision(row, mapper, objectMapper);
  }
}
