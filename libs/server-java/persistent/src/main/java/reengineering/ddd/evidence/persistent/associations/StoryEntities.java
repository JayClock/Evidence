package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.core.Ref;
import java.util.List;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.StoryDescription;
import reengineering.ddd.evidence.domain.description.StoryRevisionDescription;
import reengineering.ddd.evidence.domain.model.Delivery;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Story;
import reengineering.ddd.evidence.domain.model.StoryRevision;
import reengineering.ddd.evidence.persistent.mappers.WorkflowMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkflowRows;

final class StoryEntities {
  private static final TypeReference<List<String>> STRINGS = new TypeReference<>() {};

  private StoryEntities() {}

  static Story story(WorkflowRows.StoryRow row, Story.Revisions revisions) {
    Delivery.Authority authority =
        Delivery.authority(
            row.iterationLifecycle(),
            row.iterationLoop(),
            row.iterationStage(),
            row.pendingClarificationReference() != null);
    return new Story(
        row.id(),
        new StoryDescription(
            new Ref<>(row.workspaceId()),
            new Ref<>(row.iterationId()),
            row.iterationReference(),
            row.iterationLifecycle(),
            row.iterationLoop(),
            row.iterationStage(),
            row.title(),
            row.goal(),
            new Ref<>(row.latestRevisionId()),
            row.latestRevisionNumber(),
            row.latestScenarioCount(),
            row.latestCitationCount(),
            row.pendingClarificationReference(),
            authority,
            row.revisionCount(),
            row.version(),
            row.createdAt(),
            row.updatedAt()),
        revisions);
  }

  static StoryRevision revision(
      WorkflowRows.StoryRevisionRow row, WorkflowMapper mapper, ObjectMapper objectMapper) {
    return new StoryRevision(
        row.id(),
        new StoryRevisionDescription(
            new Ref<>(row.storyId()),
            row.revisionNumber(),
            row.title(),
            row.problem(),
            row.role(),
            row.goal(),
            row.value(),
            InboxWorkflow.CognitiveMode.parseStored(row.cognitiveMode()),
            mapper.findStoryCitations(row.id()).stream()
                .map(
                    citation ->
                        new Delivery.Citation(
                            new Ref<>(citation.inboxItemId()),
                            new Ref<>(citation.inboxRevisionId()),
                            citation.inboxRevisionNumber(),
                            citation.contentSha256(),
                            citation.locator()))
                .toList(),
            mapper.findStoryScenarios(row.id()).stream()
                .map(
                    scenario ->
                        new Delivery.Scenario(
                            scenario.id(),
                            scenario.reference(),
                            scenario.sourceDraftId(),
                            scenario.title(),
                            readStrings(scenario.givenSteps(), objectMapper),
                            scenario.whenStep(),
                            readStrings(scenario.thenSteps(), objectMapper),
                            readStrings(scenario.businessData(), objectMapper)))
                .toList(),
            row.contentSha256(),
            new Ref<>(row.createdByUserId()),
            row.createdAt()));
  }

  private static List<String> readStrings(String json, ObjectMapper objectMapper) {
    try {
      return objectMapper.readValue(json, STRINGS);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Persisted workflow strings could not be read");
    }
  }
}
