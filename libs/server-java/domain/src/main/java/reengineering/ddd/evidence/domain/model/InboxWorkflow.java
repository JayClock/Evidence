package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;

public final class InboxWorkflow {
  private static final int MIN_SOURCES = 1;
  private static final int MAX_SOURCES = 5;
  private static final int MIN_CANDIDATES = 1;
  private static final int MAX_CANDIDATES = 5;
  private static final int MAX_TITLE = 200;
  private static final int MAX_ROLE = 200;
  private static final int MAX_STATEMENT = 2_000;
  private static final int MAX_LOCATOR = 500;
  private static final int MAX_CITATIONS = 20;
  private static final int MAX_REASON = 2_000;
  private static final Pattern SHA256 = Pattern.compile("^sha256:[a-f0-9]{64}$");
  private static final Pattern GIT_SHA = Pattern.compile("^[a-f0-9]{40}(?:[a-f0-9]{24})?$");

  private InboxWorkflow() {}

  public enum ExtractionStatus {
    AWAITING_AGENT,
    COMPLETED,
    FAILED,
    CANCELLED;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static ExtractionStatus parseStored(String value) {
      try {
        return valueOf(value.toUpperCase(Locale.ROOT));
      } catch (RuntimeException error) {
        throw DomainException.internal("unsupported Inbox InboxExtraction status: " + value);
      }
    }
  }

  public enum CandidateStatus {
    READY,
    STALE,
    SELECTED,
    DEFERRED,
    REJECTED;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static CandidateStatus parse(String value) {
      try {
        return valueOf(requiredLine(value, "status").toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException error) {
        throw DomainException.validation("unsupported Inbox InboxStoryCandidate status: " + value);
      }
    }
  }

  public enum CognitiveMode {
    CLEAR,
    COMPLICATED,
    COMPLEX;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public String getWireValue() {
      return wireValue();
    }

    public static CognitiveMode parse(String value) {
      try {
        return valueOf(requiredLine(value, "cognitive mode").toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException error) {
        throw DomainException.validation(
            "unsupported Inbox InboxStoryCandidate cognitive mode: " + value);
      }
    }

    public static CognitiveMode parseStored(String value) {
      try {
        return valueOf(value.toUpperCase(Locale.ROOT));
      } catch (RuntimeException error) {
        throw DomainException.internal("unsupported Inbox InboxStoryCandidate mode: " + value);
      }
    }
  }

  public enum DecisionAction {
    DEFER,
    REJECT;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static DecisionAction parse(String value) {
      try {
        return valueOf(requiredLine(value, "decision").toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException error) {
        throw DomainException.validation(
            "unsupported Inbox InboxStoryCandidate decision: " + value);
      }
    }

    public static DecisionAction parseStored(String value) {
      try {
        return valueOf(value.toUpperCase(Locale.ROOT));
      } catch (RuntimeException error) {
        throw DomainException.internal("unsupported Inbox InboxStoryCandidate decision: " + value);
      }
    }
  }

  public record ExtractionSource(
      int position,
      Ref<String> inboxItem,
      Ref<String> inboxRevision,
      int revisionNumber,
      String sourceKind,
      String externalKey,
      Inbox.ItemStatus itemStatus,
      String title,
      String body,
      Inbox.ContentType contentType,
      String uri,
      Map<String, Object> providerMetadata,
      Instant sourceUpdatedAt,
      Instant capturedAt,
      String contentSha256) {}

  public record CitationInput(String inboxItemId, String revisionSha256, String locator) {}

  public record CandidateInput(
      String title,
      String problem,
      String role,
      String goal,
      String value,
      String cognitiveMode,
      List<CitationInput> citations) {}

  public record CandidateData(
      String title,
      String problem,
      String role,
      String goal,
      String value,
      CognitiveMode cognitiveMode,
      List<CitationInput> citations) {
    public CandidateData {
      citations = List.copyOf(citations);
    }
  }

  public record CandidateCitation(
      Ref<String> inboxItem,
      Ref<String> inboxRevision,
      int revisionNumber,
      String revisionSha256,
      String locator) {}

  public record CandidateListQuery(
      int page, int pageSize, CandidateStatus status, String extractionId, String query) {}

  public record CandidatePage(List<InboxStoryCandidate> items, int total) {
    public CandidatePage {
      items = List.copyOf(items);
    }
  }

  public record ProposedCandidates(
      InboxExtraction extraction, List<InboxStoryCandidate> candidates) {
    public ProposedCandidates {
      candidates = List.copyOf(candidates);
    }
  }

  public record CandidateDecision(
      InboxStoryCandidate candidate, InboxStoryCandidateDecision decision) {}

  public record SelectCandidateInput(
      String candidateId, String candidateSha256, String baseCommitSha) {}

  public interface Association {
    InboxExtraction createExtraction(List<String> inboxItemIds, String requestedByUserId);

    Optional<InboxExtraction> findExtraction(String extractionId);

    ProposedCandidates proposeCandidates(
        String extractionId, int expectedVersion, List<CandidateInput> candidates);

    CandidatePage listCandidates(CandidateListQuery query);

    Optional<InboxStoryCandidate> findCandidate(String candidateId);

    CandidateDecision decideCandidate(
        String candidateId,
        String candidateSha256,
        DecisionAction action,
        String reason,
        String decidedByUserId);

    Iteration selectCandidate(SelectCandidateInput input, String selectedByUserId);
  }

  public record HashedCandidate(CandidateData candidate, String contentSha256) {}

  public record HashedDecision(String reason, String contentSha256) {}

  public static List<String> normalizeExtractionSources(List<String> values) {
    if (values == null || values.size() < MIN_SOURCES || values.size() > MAX_SOURCES) {
      throw DomainException.validation("Inbox InboxExtraction must select 1 to 5 sources");
    }
    List<String> normalized =
        values.stream().map(value -> requiredLine(value, "Inbox Item id")).toList();
    if (new HashSet<>(normalized).size() != normalized.size()) {
      throw DomainException.validation("Inbox InboxExtraction must not select duplicate sources");
    }
    return normalized;
  }

  public static List<CandidateData> normalizeCandidateSet(
      List<CandidateInput> values, List<String> selectedInboxItemIds) {
    if (values == null || values.size() < MIN_CANDIDATES || values.size() > MAX_CANDIDATES) {
      throw DomainException.validation("Inbox Analyst must propose 1 to 5 Candidates");
    }
    List<CandidateData> candidates =
        values.stream().map(InboxWorkflow::normalizeCandidate).toList();
    Set<String> selected = Set.copyOf(selectedInboxItemIds);
    Set<String> covered = new HashSet<>();
    for (CandidateData candidate : candidates) {
      for (CitationInput citation : candidate.citations()) {
        if (!selected.contains(citation.inboxItemId())) {
          throw DomainException.validation(
              "Inbox InboxStoryCandidate citation references unselected source "
                  + citation.inboxItemId());
        }
        covered.add(citation.inboxItemId());
      }
    }
    for (String itemId : selected) {
      if (!covered.contains(itemId)) {
        throw DomainException.validation(
            "Inbox InboxStoryCandidate set must cite selected source " + itemId);
      }
    }
    return candidates;
  }

  public static CandidateData normalizeCandidate(CandidateInput input) {
    if (input == null)
      throw DomainException.validation("Inbox Story InboxStoryCandidate is required");
    List<CitationInput> values = input.citations();
    if (values == null || values.isEmpty()) {
      throw DomainException.validation(
          "Inbox Story InboxStoryCandidate must cite at least one selected Revision");
    }
    if (values.size() > MAX_CITATIONS) {
      throw DomainException.validation(
          "Inbox Story InboxStoryCandidate must not cite more than "
              + MAX_CITATIONS
              + " Revisions");
    }
    Set<String> seen = new HashSet<>();
    List<CitationInput> citations = new ArrayList<>();
    for (CitationInput citation : values) {
      if (citation == null) {
        throw DomainException.validation("Inbox Story InboxStoryCandidate citation is required");
      }
      CitationInput normalized =
          new CitationInput(
              requiredLine(citation.inboxItemId(), "Inbox Item id"),
              normalizeSha256(citation.revisionSha256()),
              limitedLine(citation.locator(), MAX_LOCATOR, "citation locator"));
      String key =
          normalized.inboxItemId()
              + '\u0000'
              + normalized.revisionSha256()
              + '\u0000'
              + normalized.locator();
      if (!seen.add(key)) {
        throw DomainException.validation(
            "Inbox Story InboxStoryCandidate must not contain duplicate citations");
      }
      citations.add(normalized);
    }
    return new CandidateData(
        limitedLine(input.title(), MAX_TITLE, "title"),
        limitedText(input.problem(), MAX_STATEMENT, "problem"),
        limitedLine(input.role(), MAX_ROLE, "role"),
        limitedText(input.goal(), MAX_STATEMENT, "goal"),
        limitedText(input.value(), MAX_STATEMENT, "value"),
        CognitiveMode.parse(input.cognitiveMode()),
        citations);
  }

  public static HashedCandidate hashCandidate(CandidateData candidate) {
    return new HashedCandidate(candidate, CanonicalJson.hash(candidateMap(candidate)));
  }

  public static HashedCandidate hashKickoffProposal(
      CandidateData candidate, String origin, int sequence) {
    Map<String, Object> content = new LinkedHashMap<>(candidateMap(candidate));
    content.put("origin", origin);
    content.put("sequence", sequence);
    return new HashedCandidate(candidate, CanonicalJson.hash(content));
  }

  public static HashedDecision hashDecision(
      String candidateId,
      String candidateSha256,
      DecisionAction action,
      String reason,
      String decidedByUserId,
      Instant decidedAt) {
    String normalizedReason = normalizeReason(reason);
    Map<String, Object> content = new LinkedHashMap<>();
    content.put("candidateId", candidateId);
    content.put("candidateSha256", normalizeSha256(candidateSha256));
    content.put("action", action.wireValue());
    content.put("reason", normalizedReason);
    content.put("decidedByUserId", decidedByUserId);
    content.put("decidedAt", CanonicalJson.instant(decidedAt));
    return new HashedDecision(normalizedReason, CanonicalJson.hash(content));
  }

  public static String normalizeSha256(String value) {
    String normalized = requiredLine(value, "content SHA-256").toLowerCase(Locale.ROOT);
    if (!SHA256.matcher(normalized).matches()) {
      throw DomainException.validation("Inbox content SHA-256 is invalid");
    }
    return normalized;
  }

  public static String normalizeReason(String value) {
    return limitedText(value, MAX_REASON, "decision reason");
  }

  public static SelectCandidateInput normalizeSelection(SelectCandidateInput input) {
    if (input == null)
      throw DomainException.validation("InboxStoryCandidate selection input is required");
    String baseCommitSha =
        requiredLine(input.baseCommitSha(), "base commit SHA").toLowerCase(Locale.ROOT);
    if (!GIT_SHA.matcher(baseCommitSha).matches()) {
      throw DomainException.validation("Iteration base commit SHA is invalid");
    }
    return new SelectCandidateInput(
        requiredLine(input.candidateId(), "InboxStoryCandidate id"),
        normalizeSha256(input.candidateSha256()),
        baseCommitSha);
  }

  public static void validateCandidatePage(int page, int pageSize) {
    if (page <= 0 || pageSize <= 0 || pageSize > 100) {
      throw DomainException.validation(
          "Inbox InboxStoryCandidate page and pageSize must be positive and pageSize at most 100");
    }
  }

  private static Map<String, Object> candidateMap(CandidateData candidate) {
    Map<String, Object> content = new LinkedHashMap<>();
    content.put("title", candidate.title());
    content.put("problem", candidate.problem());
    content.put("role", candidate.role());
    content.put("goal", candidate.goal());
    content.put("value", candidate.value());
    content.put("cognitiveMode", candidate.cognitiveMode().wireValue());
    content.put(
        "citations",
        candidate.citations().stream()
            .map(
                citation -> {
                  Map<String, Object> value = new LinkedHashMap<>();
                  value.put("inboxItemId", citation.inboxItemId());
                  value.put("revisionSha256", citation.revisionSha256());
                  value.put("locator", citation.locator());
                  return value;
                })
            .toList());
    return content;
  }

  private static String limitedText(String value, int maximum, String label) {
    if (value == null) {
      throw DomainException.validation("Inbox InboxStoryCandidate " + label + " must not be empty");
    }
    String normalized = value.replace("\r\n", "\n").replace('\r', '\n').trim();
    if (normalized.isEmpty()) {
      throw DomainException.validation("Inbox InboxStoryCandidate " + label + " must not be empty");
    }
    if (normalized.length() > maximum) {
      throw DomainException.validation(
          "Inbox InboxStoryCandidate " + label + " must not exceed " + maximum + " characters");
    }
    return normalized;
  }

  private static String limitedLine(String value, int maximum, String label) {
    String normalized = requiredLine(value, label);
    if (normalized.length() > maximum) {
      throw DomainException.validation(
          "Inbox InboxStoryCandidate " + label + " must not exceed " + maximum + " characters");
    }
    return normalized;
  }

  private static String requiredLine(String value, String label) {
    if (value == null || value.trim().isEmpty()) {
      throw DomainException.validation("Inbox InboxStoryCandidate " + label + " must not be empty");
    }
    String normalized = value.trim();
    if (normalized.indexOf('\r') >= 0 || normalized.indexOf('\n') >= 0) {
      throw DomainException.validation(
          "Inbox InboxStoryCandidate " + label + " must be a single line");
    }
    return normalized;
  }
}
