package reengineering.ddd.evidence.domain.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;

/** Knowledge promotion, next-Probe, and append-only human Respond authority. */
public final class Respond {
  private static final Pattern SHA256 = Pattern.compile("^sha256:[a-f0-9]{64}$");
  private static final Pattern WINDOWS_PATH = Pattern.compile("^(?:[a-zA-Z]:[\\\\/]|\\\\\\\\)");
  private static final Set<String> KNOWLEDGE_KINDS =
      Set.of(
          "product",
          "model",
          "architecture",
          "contract",
          "test_process",
          "skill",
          "prompt",
          "other");
  private static final Set<String> PROMOTION_DECISIONS = Set.of("promoted", "deferred", "rejected");

  private Respond() {}

  public record Promotion(
      String sourceRef,
      String kind,
      String decision,
      String reason,
      List<String> validationEvidenceRefs,
      String canonicalTarget) {
    public Promotion {
      validationEvidenceRefs = List.copyOf(validationEvidenceRefs);
    }
  }

  public record NextProbe(
      String question, String whyNow, List<String> evidenceRefs, String firstAction) {
    public NextProbe {
      evidenceRefs = List.copyOf(evidenceRefs);
    }
  }

  public record Authority(
      String storyRevisionSha256,
      String approvedTaskingPlanSha256,
      String pairManifestSha256,
      String approvedCommitSha,
      String showcaseEvidenceBundleSha256,
      String showcaseReviewSha256,
      String showcaseDecisionSha256,
      String authoritySha256) {}

  public record Candidate(
      String id,
      String reference,
      int sequence,
      String workspaceId,
      String iterationId,
      String storyId,
      String storyRevisionId,
      String showcaseRunId,
      String showcaseDecisionId,
      Authority authority,
      List<Promotion> promotions,
      String noPromotionReason,
      List<String> observedOutcomes,
      List<String> residualRisks,
      NextProbe nextProbe,
      String proposedAt,
      String contentSha256) {
    public Candidate {
      promotions = List.copyOf(promotions);
      observedOutcomes = List.copyOf(observedOutcomes);
      residualRisks = List.copyOf(residualRisks);
    }
  }

  public record Decision(
      String id,
      String candidateId,
      String action,
      String reason,
      String candidateSha256,
      String authoritySha256,
      String decidedByUserId,
      String decidedAt,
      String contentSha256) {}

  public record View(
      Iteration iteration,
      Delivery.Story story,
      Delivery.StoryRevision storyRevision,
      Showcase.Run showcaseRun,
      Showcase.Decision showcaseDecision,
      Authority authority,
      List<Candidate> candidates,
      List<Decision> decisions,
      Map<String, Object> nextAction) {
    public View {
      candidates = List.copyOf(candidates);
      decisions = List.copyOf(decisions);
      nextAction = nextAction == null ? null : Collections.unmodifiableMap(nextAction);
    }
  }

  public record ProposeInput(
      String actionId,
      int expectedIterationVersion,
      String authoritySha256,
      List<Promotion> promotions,
      String noPromotionReason,
      List<String> observedOutcomes,
      List<String> residualRisks,
      NextProbe nextProbe) {}

  public record DecideInput(
      int expectedIterationVersion,
      String candidateId,
      String candidateSha256,
      String authoritySha256,
      String action,
      String reason) {}

  public record ActionResult(View respond, String acceptedRecordId) {}

  public interface Association {
    Optional<View> findRespond(String iterationId);

    ActionResult proposeRespondCandidate(String iterationId, ProposeInput input);

    ActionResult decideRespond(String iterationId, DecideInput input, String decidedByUserId);
  }

  public static ProposeInput normalize(ProposeInput input) {
    required(input, "Respond Candidate");
    if (input.promotions() == null || input.promotions().size() > 50) {
      throw DomainException.validation("Respond promotions must be a bounded array");
    }
    List<Promotion> promotions = new ArrayList<>();
    for (int index = 0; index < input.promotions().size(); index++) {
      promotions.add(normalize(input.promotions().get(index), index));
    }
    String noPromotionReason = optionalText(input.noPromotionReason(), "No-promotion reason");
    if (promotions.isEmpty() && noPromotionReason == null) {
      throw DomainException.validation("Respond without promotions requires a no-promotion reason");
    }
    if (!promotions.isEmpty() && noPromotionReason != null) {
      throw DomainException.validation(
          "No-promotion reason is valid only when promotions are empty");
    }
    return new ProposeInput(
        line(input.actionId(), "Respond action id"),
        positive(input.expectedIterationVersion()),
        sha(input.authoritySha256(), "Respond authority SHA-256"),
        promotions,
        noPromotionReason,
        textList(input.observedOutcomes(), "Observed outcomes", true),
        textList(input.residualRisks(), "Residual risks", false),
        normalize(input.nextProbe()));
  }

  public static DecideInput normalize(DecideInput input) {
    required(input, "Respond decision");
    return new DecideInput(
        positive(input.expectedIterationVersion()),
        line(input.candidateId(), "Respond Candidate id"),
        sha(input.candidateSha256(), "Respond Candidate SHA-256"),
        sha(input.authoritySha256(), "Respond authority SHA-256"),
        oneOf(input.action(), "Respond decision", Set.of("approve", "revise")),
        text(input.reason(), "Respond decision reason", 4_000));
  }

  public static Map<String, Object> nextAction(
      Iteration iteration,
      Authority authority,
      Showcase.Run showcaseRun,
      Showcase.Decision showcaseDecision,
      List<Candidate> candidates) {
    if ("accepted".equals(iteration.getDescription().stage())) return null;
    LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
    payload.put("expectedIterationVersion", iteration.getDescription().version());
    payload.put("authoritySha256", authority.authoritySha256());
    if ("drafting".equals(iteration.getDescription().stage())) {
      payload.put("kind", "run_learner");
      payload.put("showcaseRunId", showcaseRun.id());
      payload.put("showcaseDecisionId", showcaseDecision.id());
    } else if ("decision".equals(iteration.getDescription().stage()) && !candidates.isEmpty()) {
      Candidate candidate = candidates.get(candidates.size() - 1);
      payload.put("kind", "await_human");
      payload.put("candidateId", candidate.id());
      payload.put("candidateSha256", candidate.contentSha256());
    } else {
      throw DomainException.internal("Respond iteration has an invalid stage");
    }
    String digest = CanonicalJson.hash(payload);
    LinkedHashMap<String, Object> action = new LinkedHashMap<>();
    action.put("actionId", "ACT-" + digest.substring("sha256:".length(), "sha256:".length() + 24));
    action.putAll(payload);
    return Collections.unmodifiableMap(action);
  }

  public static Authority authority(
      String storyRevisionSha256,
      String approvedTaskingPlanSha256,
      String pairManifestSha256,
      String approvedCommitSha,
      String showcaseEvidenceBundleSha256,
      String showcaseReviewSha256,
      String showcaseDecisionSha256) {
    LinkedHashMap<String, Object> content = new LinkedHashMap<>();
    content.put("storyRevisionSha256", storyRevisionSha256);
    content.put("approvedTaskingPlanSha256", approvedTaskingPlanSha256);
    content.put("pairManifestSha256", pairManifestSha256);
    content.put("approvedCommitSha", approvedCommitSha);
    content.put("showcaseEvidenceBundleSha256", showcaseEvidenceBundleSha256);
    content.put("showcaseReviewSha256", showcaseReviewSha256);
    content.put("showcaseDecisionSha256", showcaseDecisionSha256);
    return new Authority(
        storyRevisionSha256,
        approvedTaskingPlanSha256,
        pairManifestSha256,
        approvedCommitSha,
        showcaseEvidenceBundleSha256,
        showcaseReviewSha256,
        showcaseDecisionSha256,
        CanonicalJson.hash(content));
  }

  private static Promotion normalize(Promotion value, int index) {
    required(value, "Promotion " + (index + 1));
    String decision = oneOf(value.decision(), "Promotion decision", PROMOTION_DECISIONS);
    String target = optionalRef(value.canonicalTarget(), "Promotion canonical target");
    if ("promoted".equals(decision) && target == null) {
      throw DomainException.validation("Promoted knowledge requires a canonical target");
    }
    return new Promotion(
        safeRef(value.sourceRef(), "Promotion source"),
        oneOf(value.kind(), "Knowledge kind", KNOWLEDGE_KINDS),
        decision,
        text(value.reason(), "Promotion reason", 4_000),
        refList(value.validationEvidenceRefs(), "Promotion validation evidence", true),
        target);
  }

  private static NextProbe normalize(NextProbe value) {
    required(value, "Next Probe");
    String question = text(value.question(), "Next Probe question", 4_000);
    if (question.matches("(?iu)^(todo|tbd|continue|follow up|待办|继续)$")) {
      throw DomainException.validation("Next Probe must contain a concrete learning question");
    }
    return new NextProbe(
        question,
        text(value.whyNow(), "Next Probe rationale", 4_000),
        refList(value.evidenceRefs(), "Next Probe evidence", true),
        text(value.firstAction(), "Next Probe first action", 4_000));
  }

  private static List<String> refList(List<String> values, String label, boolean required) {
    if (values == null || values.size() > 50) {
      throw DomainException.validation(label + " must be a bounded array");
    }
    List<String> normalized =
        values.stream().map(value -> safeRef(value, label)).distinct().toList();
    if (required && normalized.isEmpty())
      throw DomainException.validation(label + " must not be empty");
    return normalized;
  }

  private static List<String> textList(List<String> values, String label, boolean required) {
    if (values == null || values.size() > 50) {
      throw DomainException.validation(label + " must be a bounded array");
    }
    List<String> normalized = new ArrayList<>();
    for (int index = 0; index < values.size(); index++) {
      normalized.add(text(values.get(index), label + "[" + index + "]", 500));
    }
    if (required && normalized.isEmpty())
      throw DomainException.validation(label + " must not be empty");
    return List.copyOf(normalized);
  }

  private static String safeRef(String value, String label) {
    String normalized = line(value, label);
    if (normalized.startsWith("/")
        || WINDOWS_PATH.matcher(normalized).find()
        || normalized.toLowerCase(java.util.Locale.ROOT).startsWith("file:")) {
      throw DomainException.validation(label + " cannot contain a local absolute path");
    }
    return normalized;
  }

  private static String optionalRef(String value, String label) {
    return value == null || value.isBlank() ? null : safeRef(value, label);
  }

  private static String optionalText(String value, String label) {
    return value == null || value.isBlank() ? null : text(value, label, 4_000);
  }

  private static String sha(String value, String label) {
    String normalized = line(value, label).toLowerCase(java.util.Locale.ROOT);
    if (!SHA256.matcher(normalized).matches())
      throw DomainException.validation(label + " is invalid");
    return normalized;
  }

  private static String oneOf(String value, String label, Set<String> allowed) {
    if (value == null || !allowed.contains(value)) {
      throw DomainException.validation(label + " is unsupported");
    }
    return value;
  }

  private static int positive(int value) {
    if (value < 1) throw DomainException.validation("Expected version must be a positive integer");
    return value;
  }

  private static String line(String value, String label) {
    String normalized = text(value, label, 500);
    if (normalized.indexOf('\n') >= 0 || normalized.indexOf('\r') >= 0) {
      throw DomainException.validation(label + " must be one line");
    }
    return normalized;
  }

  private static String text(String value, String label, int maximum) {
    if (value == null || value.trim().isEmpty() || value.trim().length() > maximum) {
      throw DomainException.validation(label + " must be between 1 and " + maximum + " characters");
    }
    return value.trim();
  }

  private static void required(Object value, String label) {
    if (value == null) throw DomainException.validation(label + " is required");
  }
}
