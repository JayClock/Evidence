package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.core.Ref;
import jakarta.inject.Inject;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.IntSupplier;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.InboxExtractionDescription;
import reengineering.ddd.evidence.domain.description.InboxStoryCandidateDecisionDescription;
import reengineering.ddd.evidence.domain.description.InboxStoryCandidateDescription;
import reengineering.ddd.evidence.domain.model.Inbox;
import reengineering.ddd.evidence.domain.model.InboxExtraction;
import reengineering.ddd.evidence.domain.model.InboxStoryCandidate;
import reengineering.ddd.evidence.domain.model.InboxStoryCandidateDecision;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.persistent.mappers.InboxMapper;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;

@Component
final class InboxWorkflowStore {
  private static final int MAX_DISCOVERY_WIP = 2;
  private static final TypeReference<Map<String, Object>> JSON_OBJECT = new TypeReference<>() {};

  private final InboxMapper mapper;
  private final ObjectMapper objectMapper;
  private final Clock clock;

  @Inject
  InboxWorkflowStore(InboxMapper mapper, ObjectMapper objectMapper, Clock clock) {
    this.mapper = mapper;
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  InboxExtraction createExtraction(
      String workspaceId, List<String> inboxItemIds, String requestedByUserId) {
    List<String> selectedIds = InboxWorkflow.normalizeExtractionSources(inboxItemIds);
    Map<String, InboxRows.ItemRow> items = new LinkedHashMap<>();
    for (InboxRows.ItemRow item : mapper.findSelectedItems(workspaceId, selectedIds)) {
      items.put(item.id(), item);
    }
    List<InboxRows.ItemRow> selected = new ArrayList<>();
    for (String itemId : selectedIds) {
      InboxRows.ItemRow item = items.get(itemId);
      if (item == null) throw DomainException.notFound("Inbox item " + itemId + " not found");
      if (!"active".equals(item.status())) {
        throw DomainException.conflict("Inbox item " + itemId + " must be active for extraction");
      }
      selected.add(item);
    }

    Instant requestedAt = timestamp();
    String extractionId = UUID.randomUUID().toString();
    mapper.insertExtraction(
        extractionId,
        reference("EXTRACT", () -> mapper.allocateExtractionNumber(workspaceId, requestedAt)),
        workspaceId,
        requestedByUserId,
        requestedAt);
    for (int position = 0; position < selected.size(); position++) {
      InboxRows.ItemRow item = selected.get(position);
      InboxRows.RevisionRow revision =
          mapper.findRevision(workspaceId, item.id(), item.latestRevisionId());
      if (revision == null) {
        throw DomainException.internal("Inbox item " + item.id() + " has no latest Revision");
      }
      mapper.insertExtractionSource(
          UUID.randomUUID().toString(), extractionId, item, revision, position);
    }
    return requireExtraction(workspaceId, extractionId);
  }

  Optional<InboxExtraction> findExtraction(String workspaceId, String extractionId) {
    InboxRows.ExtractionRow row = mapper.findExtraction(workspaceId, extractionId);
    return Optional.ofNullable(row).map(this::extraction);
  }

  InboxWorkflow.ProposedCandidates proposeCandidates(
      String workspaceId,
      String extractionId,
      int expectedVersion,
      List<InboxWorkflow.CandidateInput> candidateInputs) {
    if (expectedVersion <= 0) {
      throw DomainException.validation("Inbox Extraction expected version must be positive");
    }
    InboxRows.ExtractionRow extraction = mapper.lockExtraction(workspaceId, extractionId);
    if (extraction == null) {
      throw DomainException.notFound("Inbox Extraction " + extractionId + " not found");
    }
    if (!"awaiting_agent".equals(extraction.status())) {
      throw DomainException.conflict(
          "Inbox Extraction " + extractionId + " no longer accepts Candidates");
    }
    if (extraction.version() != expectedVersion) {
      throw DomainException.conflict("Inbox Extraction " + extractionId + " has changed");
    }

    List<InboxRows.ExtractionSourceRow> sources = mapper.findExtractionSources(extractionId);
    List<InboxWorkflow.CandidateData> candidates =
        InboxWorkflow.normalizeCandidateSet(
            candidateInputs,
            sources.stream().map(InboxRows.ExtractionSourceRow::inboxItemId).toList());
    Map<String, InboxRows.ExtractionSourceRow> sourceByItem = new LinkedHashMap<>();
    for (InboxRows.ExtractionSourceRow source : sources) {
      sourceByItem.put(source.inboxItemId(), source);
    }

    Instant proposedAt = timestamp();
    List<String> candidateIds = new ArrayList<>();
    for (InboxWorkflow.CandidateData candidate : candidates) {
      InboxWorkflow.HashedCandidate hashed = InboxWorkflow.hashCandidate(candidate);
      String candidateId = UUID.randomUUID().toString();
      candidateIds.add(candidateId);
      mapper.insertCandidate(
          candidateId,
          reference("CAND", () -> mapper.allocateCandidateNumber(workspaceId, proposedAt)),
          workspaceId,
          extractionId,
          candidate,
          hashed.contentSha256(),
          proposedAt);
      for (int position = 0; position < candidate.citations().size(); position++) {
        InboxWorkflow.CitationInput citation = candidate.citations().get(position);
        InboxRows.ExtractionSourceRow source = sourceByItem.get(citation.inboxItemId());
        if (source == null || !source.contentSha256().equals(citation.revisionSha256())) {
          throw DomainException.conflict(
              "Inbox Candidate citation no longer matches selected source "
                  + citation.inboxItemId());
        }
        mapper.insertCitation(
            UUID.randomUUID().toString(),
            candidateId,
            source,
            position,
            citation.locator(),
            citation.revisionSha256());
      }
    }
    if (mapper.completeExtraction(workspaceId, extractionId, expectedVersion, proposedAt) != 1) {
      throw DomainException.conflict("Inbox Extraction " + extractionId + " has changed");
    }
    return new InboxWorkflow.ProposedCandidates(
        requireExtraction(workspaceId, extractionId),
        candidateIds.stream().map(id -> requireCandidate(workspaceId, id)).toList());
  }

  InboxWorkflow.CandidatePage listCandidates(
      String workspaceId, InboxWorkflow.CandidateListQuery query) {
    InboxWorkflow.validateCandidatePage(query.page(), query.pageSize());
    String extractionId = optionalQuery(query.extractionId());
    String search = optionalQuery(query.query());
    List<InboxStoryCandidate> candidates =
        mapper.findCandidates(workspaceId, extractionId, search).stream()
            .map(this::candidate)
            .filter(
                value ->
                    query.status() == null || value.getDescription().status() == query.status())
            .toList();
    int from = Math.min((query.page() - 1) * query.pageSize(), candidates.size());
    int to = Math.min(from + query.pageSize(), candidates.size());
    return new InboxWorkflow.CandidatePage(candidates.subList(from, to), candidates.size());
  }

  Optional<InboxStoryCandidate> findCandidate(String workspaceId, String candidateId) {
    InboxRows.CandidateRow row = mapper.findCandidate(workspaceId, candidateId);
    return Optional.ofNullable(row).map(this::candidate);
  }

  InboxWorkflow.CandidateDecision decideCandidate(
      String workspaceId,
      String candidateId,
      String candidateSha256Input,
      InboxWorkflow.DecisionAction action,
      String reasonInput,
      String decidedByUserId) {
    String candidateSha256 = InboxWorkflow.normalizeSha256(candidateSha256Input);
    String reason = InboxWorkflow.normalizeReason(reasonInput);
    if (mapper.lockCandidate(workspaceId, candidateId) == null) {
      throw DomainException.notFound("Inbox Candidate " + candidateId + " not found");
    }
    InboxRows.CandidateRow current = requireCandidateRow(workspaceId, candidateId);
    InboxWorkflow.CandidateStatus status = status(current);
    if (status == InboxWorkflow.CandidateStatus.SELECTED
        || status == InboxWorkflow.CandidateStatus.DEFERRED
        || status == InboxWorkflow.CandidateStatus.REJECTED) {
      throw DomainException.conflict(
          "Inbox Candidate " + candidateId + " is already " + status.wireValue());
    }
    if (!current.contentSha256().equals(candidateSha256)) {
      throw DomainException.conflict("Inbox Candidate " + candidateId + " content has changed");
    }

    Instant decidedAt = timestamp();
    String decisionId = UUID.randomUUID().toString();
    InboxWorkflow.HashedDecision hashed =
        InboxWorkflow.hashDecision(
            candidateId, candidateSha256, action, reason, decidedByUserId, decidedAt);
    mapper.insertDecision(
        decisionId,
        reference("DECISION", () -> mapper.allocateDecisionNumber(workspaceId, decidedAt)),
        workspaceId,
        candidateId,
        candidateSha256,
        action.wireValue(),
        hashed.reason(),
        decidedByUserId,
        decidedAt,
        hashed.contentSha256());
    InboxRows.DecisionRow decision = mapper.findDecision(candidateId);
    if (decision == null || !decisionId.equals(decision.id())) {
      throw DomainException.internal(
          "Inbox Candidate Decision " + decisionId + " was not persisted");
    }
    return new InboxWorkflow.CandidateDecision(
        requireCandidate(workspaceId, candidateId), decision(decision));
  }

  Iteration selectCandidate(
      String workspaceId, InboxWorkflow.SelectCandidateInput rawInput, String selectedByUserId) {
    InboxWorkflow.SelectCandidateInput input = InboxWorkflow.normalizeSelection(rawInput);
    if (mapper.lockCandidate(workspaceId, input.candidateId()) == null) {
      throw DomainException.notFound("Inbox Candidate " + input.candidateId() + " not found");
    }
    InboxRows.CandidateRow candidate = requireCandidateRow(workspaceId, input.candidateId());
    InboxWorkflow.CandidateStatus status = status(candidate);
    if (status != InboxWorkflow.CandidateStatus.READY) {
      throw DomainException.conflict(
          "Inbox Candidate "
              + input.candidateId()
              + " is "
              + status.wireValue()
              + " and cannot start an Iteration");
    }
    if (!candidate.contentSha256().equals(input.candidateSha256())) {
      throw DomainException.conflict(
          "Inbox Candidate " + input.candidateId() + " content has changed");
    }
    if (mapper.countDiscoveryWip(workspaceId) >= MAX_DISCOVERY_WIP) {
      throw DomainException.conflict(
          "Discovery WIP limit " + MAX_DISCOVERY_WIP + " has been reached");
    }

    List<InboxRows.ExtractionSourceRow> sources =
        mapper.findExtractionSources(candidate.extractionId());
    if (sources.isEmpty()) {
      throw DomainException.internal(
          "Inbox Candidate " + input.candidateId() + " lost its Extraction");
    }
    List<InboxRows.CitationRow> citations = mapper.findCitations(candidate.id());
    InboxWorkflow.CandidateData candidateData = candidateData(candidate, citations);
    Instant admittedAt = timestamp();
    String iterationId = UUID.randomUUID().toString();
    mapper.insertIteration(
        iterationId,
        reference("ITER", () -> mapper.allocateIterationNumber(workspaceId, admittedAt)),
        workspaceId,
        candidate,
        input.baseCommitSha(),
        selectedByUserId,
        admittedAt);

    Map<String, Object> candidateSnapshot = candidateSnapshot(candidate, citations);
    List<Map<String, Object>> sourceSnapshots = sources.stream().map(this::sourceSnapshot).toList();
    String projection = requirementsProjection(candidateSnapshot, citations);
    Map<String, Object> intakeContent = new LinkedHashMap<>();
    intakeContent.put("candidateSnapshot", candidateSnapshot);
    intakeContent.put("sourceSnapshots", sourceSnapshots);
    intakeContent.put("requirementsProjection", projection);
    intakeContent.put("frozenAt", CanonicalJson.instant(admittedAt));
    mapper.insertIterationIntake(
        iterationId,
        CanonicalJson.stringify(candidateSnapshot),
        CanonicalJson.stringify(sourceSnapshots),
        projection,
        CanonicalJson.hash(intakeContent),
        admittedAt);

    InboxWorkflow.HashedCandidate proposal =
        InboxWorkflow.hashKickoffProposal(candidateData, "inbox_candidate", 1);
    mapper.insertKickoffProposal(
        UUID.randomUUID().toString(),
        reference("KICKOFF", () -> mapper.allocateKickoffNumber(workspaceId, admittedAt)),
        iterationId,
        proposal.candidate(),
        CanonicalJson.stringify(candidateSnapshot.get("citations")),
        proposal.contentSha256(),
        admittedAt);
    InboxRows.IterationRow row = mapper.findIteration(workspaceId, iterationId);
    if (row == null)
      throw DomainException.internal("Iteration " + iterationId + " was not persisted");
    return iteration(row);
  }

  private InboxExtraction requireExtraction(String workspaceId, String extractionId) {
    return findExtraction(workspaceId, extractionId)
        .orElseThrow(
            () -> DomainException.notFound("Inbox Extraction " + extractionId + " not found"));
  }

  private InboxStoryCandidate requireCandidate(String workspaceId, String candidateId) {
    return findCandidate(workspaceId, candidateId)
        .orElseThrow(
            () -> DomainException.notFound("Inbox Candidate " + candidateId + " not found"));
  }

  private InboxRows.CandidateRow requireCandidateRow(String workspaceId, String candidateId) {
    InboxRows.CandidateRow row = mapper.findCandidate(workspaceId, candidateId);
    if (row == null)
      throw DomainException.notFound("Inbox Candidate " + candidateId + " not found");
    return row;
  }

  private InboxExtraction extraction(InboxRows.ExtractionRow row) {
    return new InboxExtraction(
        row.id(),
        new InboxExtractionDescription(
            row.reference(),
            new Ref<>(row.workspaceId()),
            InboxWorkflow.ExtractionStatus.parseStored(row.status()),
            mapper.findExtractionSources(row.id()).stream().map(this::source).toList(),
            row.version(),
            new Ref<>(row.requestedByUserId()),
            row.requestedAt(),
            row.completedAt(),
            row.failureSummary()));
  }

  private InboxWorkflow.ExtractionSource source(InboxRows.ExtractionSourceRow row) {
    return new InboxWorkflow.ExtractionSource(
        row.position(),
        new Ref<>(row.inboxItemId()),
        new Ref<>(row.inboxRevisionId()),
        row.revisionNumber(),
        row.sourceKind(),
        row.externalKey(),
        Inbox.ItemStatus.parse(row.itemStatus()),
        row.title(),
        row.body(),
        Inbox.ContentType.parse(row.contentType()),
        row.uri(),
        metadata(row.providerMetadata()),
        row.sourceUpdatedAt(),
        row.capturedAt(),
        row.contentSha256());
  }

  private InboxStoryCandidate candidate(InboxRows.CandidateRow row) {
    return new InboxStoryCandidate(
        row.id(),
        new InboxStoryCandidateDescription(
            row.reference(),
            new Ref<>(row.workspaceId()),
            new Ref<>(row.extractionId()),
            row.title(),
            row.problem(),
            row.role(),
            row.goal(),
            row.value(),
            InboxWorkflow.CognitiveMode.parseStored(row.cognitiveMode()),
            mapper.findCitations(row.id()).stream().map(this::citation).toList(),
            row.contentSha256(),
            status(row),
            "inbox-analyst",
            row.proposedAt(),
            row.decisionId() == null ? null : new Ref<>(row.decisionId()),
            row.selectedIterationId() == null ? null : new Ref<>(row.selectedIterationId())));
  }

  private InboxWorkflow.CandidateCitation citation(InboxRows.CitationRow row) {
    return new InboxWorkflow.CandidateCitation(
        new Ref<>(row.inboxItemId()),
        new Ref<>(row.inboxRevisionId()),
        row.revisionNumber(),
        row.revisionSha256(),
        row.locator());
  }

  private InboxStoryCandidateDecision decision(InboxRows.DecisionRow row) {
    return new InboxStoryCandidateDecision(
        row.id(),
        new InboxStoryCandidateDecisionDescription(
            row.reference(),
            new Ref<>(row.workspaceId()),
            new Ref<>(row.candidateId()),
            row.candidateSha256(),
            InboxWorkflow.DecisionAction.parseStored(row.action()),
            row.reason(),
            new Ref<>(row.decidedByUserId()),
            row.decidedAt(),
            row.contentSha256()));
  }

  private static InboxWorkflow.CandidateStatus status(InboxRows.CandidateRow row) {
    if (row.selectedIterationId() != null) return InboxWorkflow.CandidateStatus.SELECTED;
    if ("defer".equals(row.decisionAction())) return InboxWorkflow.CandidateStatus.DEFERRED;
    if ("reject".equals(row.decisionAction())) return InboxWorkflow.CandidateStatus.REJECTED;
    return row.stale() ? InboxWorkflow.CandidateStatus.STALE : InboxWorkflow.CandidateStatus.READY;
  }

  private static InboxWorkflow.CandidateData candidateData(
      InboxRows.CandidateRow row, List<InboxRows.CitationRow> citations) {
    return new InboxWorkflow.CandidateData(
        row.title(),
        row.problem(),
        row.role(),
        row.goal(),
        row.value(),
        InboxWorkflow.CognitiveMode.parseStored(row.cognitiveMode()),
        citations.stream()
            .map(
                citation ->
                    new InboxWorkflow.CitationInput(
                        citation.inboxItemId(), citation.revisionSha256(), citation.locator()))
            .toList());
  }

  private static Map<String, Object> candidateSnapshot(
      InboxRows.CandidateRow row, List<InboxRows.CitationRow> citations) {
    Map<String, Object> snapshot = new LinkedHashMap<>();
    snapshot.put("candidateId", row.id());
    snapshot.put("candidateReference", row.reference());
    snapshot.put("extractionId", row.extractionId());
    snapshot.put("title", row.title());
    snapshot.put("problem", row.problem());
    snapshot.put("role", row.role());
    snapshot.put("goal", row.goal());
    snapshot.put("value", row.value());
    snapshot.put("cognitiveMode", row.cognitiveMode());
    snapshot.put(
        "citations",
        citations.stream()
            .map(
                citation -> {
                  Map<String, Object> value = new LinkedHashMap<>();
                  value.put("inboxItemId", citation.inboxItemId());
                  value.put("inboxRevisionId", citation.inboxRevisionId());
                  value.put("revisionNumber", citation.revisionNumber());
                  value.put("revisionSha256", citation.revisionSha256());
                  value.put("locator", citation.locator());
                  return value;
                })
            .toList());
    snapshot.put("contentSha256", row.contentSha256());
    snapshot.put("proposedAt", CanonicalJson.instant(row.proposedAt()));
    return snapshot;
  }

  private Map<String, Object> sourceSnapshot(InboxRows.ExtractionSourceRow row) {
    Map<String, Object> snapshot = new LinkedHashMap<>();
    snapshot.put("position", row.position());
    snapshot.put("inboxItemId", row.inboxItemId());
    snapshot.put("inboxRevisionId", row.inboxRevisionId());
    snapshot.put("revisionNumber", row.revisionNumber());
    snapshot.put("sourceKind", row.sourceKind());
    snapshot.put("externalKey", row.externalKey());
    snapshot.put("itemStatus", row.itemStatus());
    snapshot.put("title", row.title());
    snapshot.put("body", row.body());
    snapshot.put("contentType", row.contentType());
    snapshot.put("uri", row.uri());
    snapshot.put("providerMetadata", metadata(row.providerMetadata()));
    snapshot.put(
        "sourceUpdatedAt",
        row.sourceUpdatedAt() == null ? null : CanonicalJson.instant(row.sourceUpdatedAt()));
    snapshot.put("capturedAt", CanonicalJson.instant(row.capturedAt()));
    snapshot.put("contentSha256", row.contentSha256());
    return snapshot;
  }

  private static String requirementsProjection(
      Map<String, Object> candidateSnapshot, List<InboxRows.CitationRow> citations) {
    String citationLines =
        citations.stream()
            .map(
                citation ->
                    "- "
                        + citation.inboxItemId()
                        + " @ "
                        + citation.revisionSha256()
                        + " ("
                        + citation.locator()
                        + ")")
            .collect(java.util.stream.Collectors.joining("\n"));
    return String.join(
        "\n",
        "# " + candidateSnapshot.get("title"),
        "",
        candidateSnapshot.get("problem").toString(),
        "",
        "As " + candidateSnapshot.get("role"),
        "I want " + candidateSnapshot.get("goal"),
        "So that " + candidateSnapshot.get("value"),
        "",
        "## Frozen sources",
        "",
        citationLines,
        "");
  }

  private Iteration iteration(InboxRows.IterationRow row) {
    return IterationEntities.iteration(row);
  }

  private Map<String, Object> metadata(String json) {
    try {
      return CanonicalJson.normalizeObject(
          objectMapper.readValue(json, JSON_OBJECT), "provider metadata");
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Inbox provider metadata could not be read");
    }
  }

  private String reference(String prefix, IntSupplier sequence) {
    return "%s-%04d".formatted(prefix, sequence.getAsInt());
  }

  private Instant timestamp() {
    return clock.instant().truncatedTo(ChronoUnit.MILLIS);
  }

  private static String optionalQuery(String value) {
    return value == null || value.trim().isEmpty() ? null : value.trim();
  }
}
