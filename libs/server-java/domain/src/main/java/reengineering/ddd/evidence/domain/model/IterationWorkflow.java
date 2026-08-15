package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import reengineering.ddd.evidence.domain.DomainException;

/** Candidate admission, provisioning, and Kickoff authority for one Workspace. */
public final class IterationWorkflow {
  private static final Pattern GIT_SHA = Pattern.compile("^[a-f0-9]{40}(?:[a-f0-9]{24})?$");
  private static final Pattern BRANCH = Pattern.compile("^evidence/iter-[a-z0-9][a-z0-9-]*$");
  private static final int MAX_REASON = 2_000;

  private IterationWorkflow() {}

  public enum KickoffAction {
    CONFIRM,
    REVISE,
    SPLIT,
    DEFER,
    STOP;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static KickoffAction parse(String value) {
      try {
        return valueOf(requiredLine(value, "Kickoff decision").toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException error) {
        throw DomainException.validation("unsupported Kickoff decision: " + value);
      }
    }

    public static KickoffAction parseStored(String value) {
      try {
        return valueOf(value.toUpperCase(Locale.ROOT));
      } catch (RuntimeException error) {
        throw DomainException.internal("unsupported Kickoff Decision action: " + value);
      }
    }
  }

  public enum ProposalOrigin {
    INBOX_CANDIDATE,
    REQUIREMENTS_ANALYST;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static ProposalOrigin parseStored(String value) {
      try {
        return valueOf(value.toUpperCase(Locale.ROOT));
      } catch (RuntimeException error) {
        throw DomainException.internal("unsupported Kickoff Proposal origin: " + value);
      }
    }
  }

  public record FrozenCitation(
      Ref<String> inboxItem,
      Ref<String> inboxRevision,
      int revisionNumber,
      String revisionSha256,
      String locator) {}

  public record FrozenCandidate(
      String candidateId,
      String candidateReference,
      String extractionId,
      String title,
      String problem,
      String role,
      String goal,
      String value,
      InboxWorkflow.CognitiveMode cognitiveMode,
      List<FrozenCitation> citations,
      String contentSha256,
      Instant proposedAt) {
    public FrozenCandidate {
      citations = List.copyOf(citations);
    }
  }

  public record FrozenSource(
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
      java.util.Map<String, Object> providerMetadata,
      Instant sourceUpdatedAt,
      Instant capturedAt,
      String contentSha256) {}

  public record IntakeDescription(
      Ref<String> iteration,
      FrozenCandidate candidate,
      List<FrozenSource> sources,
      String requirementsProjection,
      String contentSha256,
      Instant frozenAt) {
    public IntakeDescription {
      sources = List.copyOf(sources);
    }
  }

  public static final class Intake implements Entity<String, IntakeDescription> {
    private final String identity;
    private final IntakeDescription description;

    public Intake(String identity, IntakeDescription description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public IntakeDescription getDescription() {
      return description;
    }
  }

  public record KickoffProposalDescription(
      String reference,
      Ref<String> iteration,
      int sequence,
      ProposalOrigin origin,
      String title,
      String problem,
      String role,
      String goal,
      String value,
      InboxWorkflow.CognitiveMode cognitiveMode,
      List<FrozenCitation> citations,
      String contentSha256,
      Instant proposedAt) {
    public KickoffProposalDescription {
      citations = List.copyOf(citations);
    }
  }

  public static final class KickoffProposal implements Entity<String, KickoffProposalDescription> {
    private final String identity;
    private final KickoffProposalDescription description;

    public KickoffProposal(String identity, KickoffProposalDescription description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public KickoffProposalDescription getDescription() {
      return description;
    }
  }

  public record KickoffDecisionDescription(
      String reference,
      Ref<String> iteration,
      Ref<String> proposal,
      String proposalSha256,
      KickoffAction action,
      String reason,
      Ref<String> decidedBy,
      Instant decidedAt,
      String contentSha256) {}

  public static final class KickoffDecision implements Entity<String, KickoffDecisionDescription> {
    private final String identity;
    private final KickoffDecisionDescription description;

    public KickoffDecision(String identity, KickoffDecisionDescription description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public KickoffDecisionDescription getDescription() {
      return description;
    }
  }

  public record ProblemStatementDescription(
      Ref<String> iteration,
      Ref<String> story,
      int revisionNumber,
      String title,
      String problem,
      InboxWorkflow.CognitiveMode cognitiveMode,
      List<FrozenCitation> citations,
      String contentSha256,
      Instant createdAt) {
    public ProblemStatementDescription {
      citations = List.copyOf(citations);
    }
  }

  public static final class ProblemStatement
      implements Entity<String, ProblemStatementDescription> {
    private final String identity;
    private final ProblemStatementDescription description;

    public ProblemStatement(String identity, ProblemStatementDescription description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public ProblemStatementDescription getDescription() {
      return description;
    }
  }

  public record StoryCardDescription(
      Ref<String> iteration,
      Ref<String> story,
      int revisionNumber,
      String title,
      String role,
      String goal,
      String value,
      Ref<String> problemStatement,
      String contentSha256,
      Instant createdAt) {}

  public static final class StoryCard implements Entity<String, StoryCardDescription> {
    private final String identity;
    private final StoryCardDescription description;

    public StoryCard(String identity, StoryCardDescription description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public StoryCardDescription getDescription() {
      return description;
    }
  }

  public record CompleteProvisioningInput(
      int expectedVersion, String baseCommitSha, String branchName) {}

  public record FailProvisioningInput(int expectedVersion, String reason) {}

  public record KickoffDecisionInput(
      String proposalId,
      String proposalSha256,
      int expectedIterationVersion,
      KickoffAction action,
      String reason) {}

  public record KickoffView(
      Iteration iteration,
      Intake intake,
      KickoffProposal currentProposal,
      List<KickoffDecision> decisions) {
    public KickoffView {
      decisions = List.copyOf(decisions);
    }
  }

  public record KickoffDecisionResult(
      Iteration iteration,
      KickoffDecision decision,
      ProblemStatement problemStatement,
      StoryCard storyCard) {}

  public interface Association {
    Optional<Iteration> findIteration(String iterationId);

    Optional<Intake> findIntake(String iterationId);

    Iteration completeProvisioning(String iterationId, CompleteProvisioningInput input);

    Iteration failProvisioning(String iterationId, FailProvisioningInput input);

    Optional<KickoffView> findKickoff(String iterationId);

    KickoffProposal proposeKickoffReplacement(
        String iterationId, int expectedIterationVersion, InboxWorkflow.CandidateInput proposal);

    KickoffDecisionResult decideKickoff(
        String iterationId, KickoffDecisionInput input, String decidedByUserId);
  }

  public static CompleteProvisioningInput normalize(CompleteProvisioningInput input) {
    if (input == null) throw DomainException.validation("Iteration provisioning input is required");
    int expectedVersion = positive(input.expectedVersion(), "Iteration expected version");
    String baseCommitSha = gitSha(input.baseCommitSha());
    String branchName = requiredLine(input.branchName(), "Iteration branch name");
    if (!BRANCH.matcher(branchName).matches()) {
      throw DomainException.validation("Iteration branch name must use evidence/iter-<reference>");
    }
    return new CompleteProvisioningInput(expectedVersion, baseCommitSha, branchName);
  }

  public static FailProvisioningInput normalize(FailProvisioningInput input) {
    if (input == null) {
      throw DomainException.validation("Iteration provisioning failure is required");
    }
    return new FailProvisioningInput(
        positive(input.expectedVersion(), "Iteration expected version"),
        requiredText(input.reason(), "Kickoff decision reason", MAX_REASON));
  }

  public static KickoffDecisionInput normalize(KickoffDecisionInput input) {
    if (input == null) throw DomainException.validation("Kickoff Decision input is required");
    KickoffAction action = input.action();
    if (action == null) throw DomainException.validation("Kickoff decision is required");
    String reason = optionalText(input.reason(), MAX_REASON);
    if (action != KickoffAction.CONFIRM && reason == null) {
      throw DomainException.validation("Kickoff decision reason is required");
    }
    return new KickoffDecisionInput(
        requiredLine(input.proposalId(), "Kickoff Proposal id"),
        InboxWorkflow.normalizeSha256(input.proposalSha256()),
        positive(input.expectedIterationVersion(), "Iteration expected version"),
        action,
        reason);
  }

  public static String gitSha(String value) {
    String normalized = requiredLine(value, "base commit SHA").toLowerCase(Locale.ROOT);
    if (!GIT_SHA.matcher(normalized).matches()) {
      throw DomainException.validation("Iteration base commit SHA is invalid");
    }
    return normalized;
  }

  private static int positive(int value, String label) {
    if (value <= 0) throw DomainException.validation(label + " must be positive");
    return value;
  }

  static String requiredLine(String value, String label) {
    if (value == null || value.trim().isEmpty()) {
      throw DomainException.validation(label + " must not be empty");
    }
    String normalized = value.trim();
    if (normalized.indexOf('\r') >= 0 || normalized.indexOf('\n') >= 0) {
      throw DomainException.validation(label + " must be a single line");
    }
    return normalized;
  }

  static String requiredText(String value, String label, int maximum) {
    String normalized = optionalText(value, maximum);
    if (normalized == null) throw DomainException.validation(label + " must not be empty");
    return normalized;
  }

  static String optionalText(String value, int maximum) {
    if (value == null || value.trim().isEmpty()) return null;
    String normalized = value.replace("\r\n", "\n").replace('\r', '\n').trim();
    if (normalized.length() > maximum) {
      throw DomainException.validation("text must not exceed " + maximum + " characters");
    }
    return normalized;
  }
}
