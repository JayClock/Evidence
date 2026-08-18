package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Delivery;
import reengineering.ddd.evidence.domain.model.Story;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.persistent.mappers.WorkflowMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkflowRows;

@AssociationMapping(entity = Workspace.class, field = "stories", parentIdField = "workspaceId")
public final class WorkspaceStories extends EntityList<String, Story> implements Workspace.Stories {
  private String workspaceId;
  @Inject private WorkflowMapper mapper;
  @Inject private ObjectMapper objectMapper;

  public WorkspaceStories() {}

  @Override
  protected List<Story> findEntities(int from, int to) {
    return mapper.findStories(workspaceId, from, Math.max(to - from, 0)).stream()
        .map(this::story)
        .toList();
  }

  @Override
  protected Story findEntity(String storyId) {
    WorkflowRows.StoryRow row = mapper.findStory(workspaceId, storyId);
    return row == null ? null : story(row);
  }

  @Override
  public int size() {
    return mapper.countStories(workspaceId);
  }

  @Override
  public Delivery.Page<Story> listStories(int page, int pageSize) {
    validatePage(page, pageSize);
    return new Delivery.Page<>(
        mapper.findStories(workspaceId, (page - 1) * pageSize, pageSize).stream()
            .map(this::story)
            .toList(),
        size());
  }

  @Override
  public Delivery.PortfolioSummary summarizeStories() {
    Map<String, Integer> stages = new HashMap<>();
    Map<String, Integer> actions = new HashMap<>();
    int human = 0;
    int agent = 0;
    int approved = 0;
    for (WorkflowRows.StoryRow row : mapper.findAllStories(workspaceId)) {
      Delivery.Authority authority =
          Delivery.authority(
              row.iterationLifecycle(),
              row.iterationLoop(),
              row.iterationStage(),
              row.pendingClarificationReference() != null);
      stages.merge(row.iterationLoop() + "/" + row.iterationStage(), 1, Integer::sum);
      actions.merge(authority.nextAction(), 1, Integer::sum);
      if ("human".equals(authority.owner())) human++;
      if ("agent".equals(authority.owner())) agent++;
      if ("respond".equals(row.iterationLoop()) && "accepted".equals(row.iterationStage())) {
        approved++;
      }
    }
    List<Delivery.StageCount> stageCounts =
        stages.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .map(
                entry -> {
                  String[] parts = entry.getKey().split("/", 2);
                  return new Delivery.StageCount(parts[0], parts[1], entry.getValue());
                })
            .toList();
    List<Delivery.ActionCount> actionCounts =
        actions.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .map(entry -> new Delivery.ActionCount(entry.getKey(), entry.getValue()))
            .toList();
    return new Delivery.PortfolioSummary(human, agent, approved, stageCounts, actionCounts);
  }

  @Override
  public java.util.Optional<Story> findStory(String storyId) {
    return findByIdentity(storyId);
  }

  private Story story(WorkflowRows.StoryRow row) {
    return StoryEntities.story(row, new StoryRevisions(row.id(), mapper, objectMapper));
  }

  private static void validatePage(int page, int pageSize) {
    if (page <= 0 || pageSize <= 0) {
      throw DomainException.validation("page and pageSize must be greater than 0");
    }
  }
}
