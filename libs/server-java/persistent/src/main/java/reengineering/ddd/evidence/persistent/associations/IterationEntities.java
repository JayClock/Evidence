package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.IterationDescription;
import reengineering.ddd.evidence.domain.description.IterationIntakeDescription;
import reengineering.ddd.evidence.domain.model.Inbox;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.domain.model.IterationIntake;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;
import reengineering.ddd.evidence.persistent.mappers.WorkflowRows;

final class IterationEntities {
  private static final TypeReference<Map<String, Object>> OBJECT = new TypeReference<>() {};
  private static final TypeReference<List<Map<String, Object>>> OBJECTS = new TypeReference<>() {};

  private IterationEntities() {}

  static Iteration iteration(InboxRows.IterationRow row, Iteration.Intake intake) {
    return new Iteration(
        row.id(),
        new IterationDescription(
            row.reference(),
            new Ref<>(row.workspaceId()),
            new Ref<>(row.sourceCandidateId()),
            row.sourceCandidateSha256(),
            row.lifecycle(),
            row.loop(),
            row.stage(),
            row.lane(),
            row.version(),
            row.baseCommitSha(),
            row.branchName(),
            row.provisioningFailureSummary(),
            row.activeStoryId() == null ? null : new Ref<>(row.activeStoryId()),
            new Ref<>(row.admittedByUserId()),
            row.admittedAt(),
            row.updatedAt()),
        intake);
  }

  static IterationIntake intake(WorkflowRows.IntakeRow row, ObjectMapper objectMapper) {
    Map<String, Object> candidate = read(row.candidateSnapshot(), OBJECT, objectMapper);
    return new IterationIntake(
        row.iterationId(),
        new IterationIntakeDescription(
            new Ref<>(row.iterationId()),
            frozenCandidate(candidate),
            read(row.sourceSnapshots(), OBJECTS, objectMapper).stream()
                .map(IterationEntities::frozenSource)
                .toList(),
            row.requirementsProjection(),
            row.contentSha256(),
            row.frozenAt()));
  }

  private static IterationWorkflow.FrozenCandidate frozenCandidate(Map<String, Object> value) {
    return new IterationWorkflow.FrozenCandidate(
        string(value, "candidateId"),
        string(value, "candidateReference"),
        string(value, "extractionId"),
        string(value, "title"),
        string(value, "problem"),
        string(value, "role"),
        string(value, "goal"),
        string(value, "value"),
        InboxWorkflow.CognitiveMode.parseStored(string(value, "cognitiveMode")),
        objects(value, "citations").stream().map(IterationEntities::frozenCitation).toList(),
        string(value, "contentSha256"),
        Instant.parse(string(value, "proposedAt")));
  }

  private static IterationWorkflow.FrozenSource frozenSource(Map<String, Object> value) {
    return new IterationWorkflow.FrozenSource(
        integer(value, "position"),
        new Ref<>(string(value, "inboxItemId")),
        new Ref<>(string(value, "inboxRevisionId")),
        integer(value, "revisionNumber"),
        string(value, "sourceKind"),
        string(value, "externalKey"),
        Inbox.ItemStatus.parse(string(value, "itemStatus")),
        string(value, "title"),
        string(value, "body"),
        Inbox.ContentType.parse(string(value, "contentType")),
        optionalString(value.get("uri")),
        object(value, "providerMetadata"),
        optionalInstant(value.get("sourceUpdatedAt")),
        Instant.parse(string(value, "capturedAt")),
        string(value, "contentSha256"));
  }

  private static IterationWorkflow.FrozenCitation frozenCitation(Map<String, Object> value) {
    return new IterationWorkflow.FrozenCitation(
        new Ref<>(string(value, "inboxItemId")),
        new Ref<>(string(value, "inboxRevisionId")),
        integer(value, "revisionNumber"),
        string(value, "revisionSha256"),
        string(value, "locator"));
  }

  private static <T> T read(String json, TypeReference<T> type, ObjectMapper objectMapper) {
    try {
      return objectMapper.readValue(json, type);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Persisted iteration JSON could not be read");
    }
  }

  private static Map<String, Object> object(Map<String, Object> value, String name) {
    Object raw = value.get(name);
    if (!(raw instanceof Map<?, ?> map)) {
      throw DomainException.internal("Persisted iteration " + name + " is invalid");
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> cast = (Map<String, Object>) map;
    return cast;
  }

  private static List<Map<String, Object>> objects(Map<String, Object> value, String name) {
    Object raw = value.get(name);
    if (!(raw instanceof List<?> list)) {
      throw DomainException.internal("Persisted iteration " + name + " is invalid");
    }
    return list.stream()
        .map(
            item -> {
              if (!(item instanceof Map<?, ?> map)) {
                throw DomainException.internal("Persisted iteration " + name + " is invalid");
              }
              @SuppressWarnings("unchecked")
              Map<String, Object> cast = (Map<String, Object>) map;
              return cast;
            })
        .toList();
  }

  private static String string(Map<String, Object> value, String name) {
    Object raw = value.get(name);
    if (!(raw instanceof String text) || text.isBlank()) {
      throw DomainException.internal("Persisted iteration " + name + " is invalid");
    }
    return text;
  }

  private static int integer(Map<String, Object> value, String name) {
    Object raw = value.get(name);
    if (!(raw instanceof Number number)) {
      throw DomainException.internal("Persisted iteration " + name + " is invalid");
    }
    return number.intValue();
  }

  private static String optionalString(Object value) {
    return value instanceof String text && !text.isBlank() ? text : null;
  }

  private static Instant optionalInstant(Object value) {
    String text = optionalString(value);
    return text == null ? null : Instant.parse(text);
  }
}
