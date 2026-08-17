package reengineering.ddd.evidence.domain.model;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import reengineering.ddd.evidence.domain.DomainException;

/** Three Questions, scenario confirmation, and Story Revision authority. */
public final class Understanding {
  private static final int MAX_QUESTION_BYTES = 1_536;
  private static final int MAX_ANSWER = 16_000;
  private static final int MAX_SCENARIOS = 5;
  private static final int MAX_STEPS = 20;
  private static final int MAX_TITLE = 200;
  private static final int MAX_TEXT = 2_000;
  private static final Pattern SHA256 = Pattern.compile("^sha256:[a-f0-9]{64}$");

  private Understanding() {}

  public enum ClarificationTarget {
    BUSINESS_CONTEXT,
    STORY,
    HISTORY;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static ClarificationTarget parse(String value) {
      try {
        return valueOf(singleLine(value, 255, "clarification target").toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException error) {
        throw DomainException.validation("unsupported clarification target: " + value);
      }
    }
  }

  public enum ClarificationStatus {
    PENDING,
    ANSWERED,
    WAIVED;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static ClarificationStatus parseStored(String value) {
      try {
        return valueOf(value.toUpperCase(Locale.ROOT));
      } catch (RuntimeException error) {
        throw DomainException.internal("unsupported clarification status: " + value);
      }
    }
  }

  public enum DecisionAction {
    CONFIRM,
    CONTINUE,
    SPLIT,
    DEFER;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static DecisionAction parse(String value) {
      try {
        return valueOf(singleLine(value, 255, "Understanding decision").toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException error) {
        throw DomainException.validation("unsupported Understanding decision: " + value);
      }
    }

    public static DecisionAction parseStored(String value) {
      try {
        return valueOf(value.toUpperCase(Locale.ROOT));
      } catch (RuntimeException error) {
        throw DomainException.internal("unsupported Understanding decision: " + value);
      }
    }
  }

  public record ScenarioInput(
      String title, List<String> given, String when, List<String> then, List<String> businessData) {
    public ScenarioInput {
      given = List.copyOf(given);
      then = List.copyOf(then);
      businessData = List.copyOf(businessData);
    }
  }

  public record View(
      Iteration iteration,
      Story story,
      StoryRevision storyRevision,
      Clarification pendingClarification,
      List<Clarification> clarifications,
      ScenarioProposal currentScenarioProposal,
      List<UnderstandingDecision> decisions) {
    public View {
      clarifications = List.copyOf(clarifications);
      decisions = List.copyOf(decisions);
    }
  }

  public record AskInput(
      int expectedIterationVersion,
      String storyId,
      String storyRevisionId,
      ClarificationTarget target,
      String question) {}

  public record AnswerInput(int expectedIterationVersion, String clarificationId, String answer) {}

  public record ProposeScenariosInput(
      int expectedIterationVersion,
      String storyId,
      String storyRevisionId,
      List<ScenarioInput> scenarios) {
    public ProposeScenariosInput {
      scenarios = scenarios == null ? null : List.copyOf(scenarios);
    }
  }

  public record DecideInput(
      int expectedIterationVersion,
      DecisionAction action,
      String proposalId,
      String proposalSha256,
      List<String> selectedDraftIds,
      String reason) {
    public DecideInput {
      selectedDraftIds = selectedDraftIds == null ? List.of() : List.copyOf(selectedDraftIds);
    }
  }

  public record AnswerResult(Iteration iteration, Clarification clarification) {}

  public record DecisionResult(
      Iteration iteration, UnderstandingDecision decision, StoryRevision storyRevision) {}

  public interface Association {
    Optional<View> findUnderstanding(String iterationId);

    Clarification askClarification(String iterationId, AskInput input);

    AnswerResult answerClarification(
        String iterationId, AnswerInput input, String answeredByUserId);

    ScenarioProposal proposeScenarioSet(String iterationId, ProposeScenariosInput input);

    DecisionResult decideUnderstanding(
        String iterationId, DecideInput input, String decidedByUserId);
  }

  public static AskInput normalize(AskInput input) {
    if (input == null) throw DomainException.validation("clarification input is required");
    String question = text(input.question(), MAX_TEXT, "clarification question");
    if (question.getBytes(StandardCharsets.UTF_8).length > MAX_QUESTION_BYTES) {
      throw DomainException.validation(
          "clarification question must not exceed " + MAX_QUESTION_BYTES + " UTF-8 bytes");
    }
    if (input.target() == null) {
      throw DomainException.validation("clarification target is required");
    }
    return new AskInput(
        positive(input.expectedIterationVersion(), "Iteration expected version"),
        identifier(input.storyId(), "Story id"),
        identifier(input.storyRevisionId(), "Story Revision id"),
        input.target(),
        question);
  }

  public static AnswerInput normalize(AnswerInput input) {
    if (input == null) throw DomainException.validation("clarification answer is required");
    return new AnswerInput(
        positive(input.expectedIterationVersion(), "Iteration expected version"),
        identifier(input.clarificationId(), "Clarification id"),
        text(input.answer(), MAX_ANSWER, "clarification answer"));
  }

  public static ProposeScenariosInput normalize(ProposeScenariosInput input) {
    if (input == null
        || input.scenarios() == null
        || input.scenarios().isEmpty()
        || input.scenarios().size() > MAX_SCENARIOS) {
      throw DomainException.validation("Scenario Proposal must contain 1–5 drafts");
    }
    List<ScenarioInput> scenarios =
        java.util.stream.IntStream.range(0, input.scenarios().size())
            .mapToObj(index -> normalizeScenario(input.scenarios().get(index), index))
            .toList();
    if (new HashSet<>(scenarios).size() != scenarios.size()) {
      throw DomainException.validation("Scenario Proposal must not contain duplicate drafts");
    }
    return new ProposeScenariosInput(
        positive(input.expectedIterationVersion(), "Iteration expected version"),
        identifier(input.storyId(), "Story id"),
        identifier(input.storyRevisionId(), "Story Revision id"),
        scenarios);
  }

  public static DecideInput normalize(DecideInput input) {
    if (input == null || input.action() == null) {
      throw DomainException.validation("Understanding decision is required");
    }
    String reason = optionalText(input.reason(), MAX_TEXT);
    if (input.action() != DecisionAction.CONFIRM && reason == null) {
      throw DomainException.validation(
          "Understanding " + input.action().wireValue() + " requires a reason");
    }
    List<String> selected =
        input.selectedDraftIds().stream()
            .map(value -> identifier(value, "selected Draft id"))
            .toList();
    if (new HashSet<>(selected).size() != selected.size()) {
      throw DomainException.validation("selected Draft ids must be unique");
    }
    String proposalId = optionalIdentifier(input.proposalId(), "Scenario Proposal id");
    String proposalSha256 = optionalSha(input.proposalSha256());
    if (input.action() == DecisionAction.CONFIRM || input.action() == DecisionAction.CONTINUE) {
      if (proposalId == null || proposalSha256 == null) {
        throw DomainException.validation(
            "Understanding "
                + input.action().wireValue()
                + " requires the current Scenario Proposal");
      }
    }
    if (input.action() == DecisionAction.CONFIRM && selected.isEmpty()) {
      throw DomainException.validation(
          "Understanding confirm requires at least one selected Draft");
    }
    return new DecideInput(
        positive(input.expectedIterationVersion(), "Iteration expected version"),
        input.action(),
        proposalId,
        proposalSha256,
        selected,
        reason);
  }

  private static ScenarioInput normalizeScenario(ScenarioInput input, int index) {
    if (input == null) {
      throw DomainException.validation("Scenario Draft " + (index + 1) + " is required");
    }
    String label = "Scenario Draft " + (index + 1);
    return new ScenarioInput(
        singleLine(input.title(), MAX_TITLE, label + " title"),
        textList(input.given(), label + " Given"),
        text(input.when(), MAX_TEXT, label + " When"),
        textList(input.then(), label + " Then"),
        textList(input.businessData(), label + " businessData"));
  }

  private static List<String> textList(List<String> values, String label) {
    if (values == null || values.isEmpty()) {
      throw DomainException.validation(label + " must contain at least one item");
    }
    if (values.size() > MAX_STEPS) {
      throw DomainException.validation(
          label + " must not contain more than " + MAX_STEPS + " items");
    }
    List<String> normalized = values.stream().map(value -> text(value, MAX_TEXT, label)).toList();
    if (new HashSet<>(normalized).size() != normalized.size()) {
      throw DomainException.validation(label + " must not contain duplicates");
    }
    return normalized;
  }

  private static int positive(int value, String label) {
    if (value <= 0) throw DomainException.validation(label + " must be positive");
    return value;
  }

  private static String identifier(String value, String label) {
    return singleLine(value, 255, label);
  }

  private static String optionalIdentifier(String value, String label) {
    return value == null || value.isEmpty() ? null : identifier(value, label);
  }

  private static String optionalSha(String value) {
    if (value == null || value.isEmpty()) return null;
    String normalized = singleLine(value, 71, "Scenario Proposal SHA-256").toLowerCase(Locale.ROOT);
    if (!SHA256.matcher(normalized).matches()) {
      throw DomainException.validation("Scenario Proposal SHA-256 is invalid");
    }
    return normalized;
  }

  private static String singleLine(String value, int maximum, String label) {
    String normalized = text(value, maximum, label);
    if (normalized.indexOf('\n') >= 0) {
      throw DomainException.validation(label + " must be a single line");
    }
    return normalized;
  }

  private static String text(String value, int maximum, String label) {
    if (value == null) throw DomainException.validation(label + " must not be empty");
    String normalized = value.replace("\r\n", "\n").replace('\r', '\n').trim();
    if (normalized.isEmpty()) throw DomainException.validation(label + " must not be empty");
    if (normalized.length() > maximum) {
      throw DomainException.validation(label + " must not exceed " + maximum + " characters");
    }
    return normalized;
  }

  private static String optionalText(String value, int maximum) {
    return value == null || value.trim().isEmpty() ? null : text(value, maximum, "decision reason");
  }
}
