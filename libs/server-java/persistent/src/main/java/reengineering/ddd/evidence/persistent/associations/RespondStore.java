package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Delivery;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.domain.model.Pair;
import reengineering.ddd.evidence.domain.model.Respond;
import reengineering.ddd.evidence.domain.model.Showcase;
import reengineering.ddd.evidence.persistent.mappers.ExecutionMapper;
import reengineering.ddd.evidence.persistent.mappers.ExecutionRows;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;

@Component
final class RespondStore {
  private static final TypeReference<List<Respond.Promotion>> PROMOTIONS = new TypeReference<>() {};

  @Inject private ExecutionMapper mapper;
  @Inject private ObjectMapper objectMapper;
  @Inject private PairStore pairStore;
  @Inject private ShowcaseStore showcaseStore;

  Respond.View find(String workspaceId, String iterationId) {
    ExecutionRows.ShowcaseRunRow showcase = acceptedShowcase(workspaceId, iterationId);
    return showcase == null ? null : load(workspaceId, iterationId, showcase);
  }

  Respond.ActionResult propose(
      String workspaceId, String iterationId, Respond.ProposeInput rawInput) {
    Respond.ProposeInput input = Respond.normalize(rawInput);
    ExecutionRows.RespondCandidateRow duplicate =
        mapper.findRespondCandidateByAction(workspaceId, iterationId, input.actionId());
    if (duplicate != null) return actionResult(workspaceId, iterationId, duplicate.id());
    ExecutionRows.ShowcaseRunRow accepted = requireAcceptedShowcase(workspaceId, iterationId);
    Respond.View view = load(workspaceId, iterationId, accepted);
    Map<String, Object> next = requireAction(view, "run_learner");
    if (!Objects.equals(next.get("actionId"), input.actionId())
        || !Objects.equals(next.get("authoritySha256"), input.authoritySha256())
        || ((Number) next.get("expectedIterationVersion")).intValue()
            != input.expectedIterationVersion()) {
      throw DomainException.conflict("Respond proposal authority has changed");
    }
    Instant timestamp = pairStore.timestamp();
    int sequence = view.candidates().size() + 1;
    String id = UUID.randomUUID().toString();
    String reference =
        "RESP-" + String.format("%04d", mapper.countRespondCandidates(workspaceId) + 1);
    Map<String, Object> content =
        Pair.map(
            "reference", reference,
            "sequence", sequence,
            "actionId", input.actionId(),
            "workspaceId", workspaceId,
            "iterationId", iterationId,
            "storyId", accepted.storyId(),
            "storyRevisionId", accepted.storyRevisionId(),
            "showcaseRunId", accepted.id(),
            "showcaseDecisionId", view.showcaseDecision().id(),
            "authority", view.authority(),
            "promotions", input.promotions(),
            "noPromotionReason", input.noPromotionReason(),
            "observedOutcomes", input.observedOutcomes(),
            "residualRisks", input.residualRisks(),
            "nextProbe", input.nextProbe(),
            "proposedAt", CanonicalJson.instant(timestamp));
    mapper.insertRespondCandidate(
        new ExecutionRows.RespondCandidateRow(
            id,
            reference,
            sequence,
            input.actionId(),
            workspaceId,
            iterationId,
            accepted.storyId(),
            accepted.storyRevisionId(),
            accepted.id(),
            view.showcaseDecision().id(),
            pairStore.write(view.authority()),
            view.authority().authoritySha256(),
            pairStore.write(input.promotions()),
            input.noPromotionReason(),
            pairStore.write(input.observedOutcomes()),
            pairStore.write(input.residualRisks()),
            pairStore.write(input.nextProbe()),
            timestamp,
            CanonicalJson.hash(content)));
    InboxRows.IterationRow iteration = pairStore.requireIteration(workspaceId, iterationId);
    if (!"respond".equals(iteration.loop()) || !"drafting".equals(iteration.stage())) {
      throw DomainException.conflict("Respond is not awaiting a Learner proposal");
    }
    pairStore.claimIteration(
        iteration, input.expectedIterationVersion(), "active", "respond", "decision", timestamp);
    return actionResult(workspaceId, iterationId, id);
  }

  Respond.ActionResult decide(
      String workspaceId, String iterationId, Respond.DecideInput rawInput, String actorUserId) {
    Respond.DecideInput input = Respond.normalize(rawInput);
    ExecutionRows.RespondDecisionRow duplicate =
        mapper.findRespondDecisionByCandidate(input.candidateId());
    if (duplicate != null) {
      if (!duplicate.action().equals(input.action())
          || !duplicate.candidateSha256().equals(input.candidateSha256())
          || !duplicate.authoritySha256().equals(input.authoritySha256())) {
        throw DomainException.conflict("Respond Candidate already has a different decision");
      }
      return actionResult(workspaceId, iterationId, duplicate.id());
    }
    ExecutionRows.ShowcaseRunRow accepted = requireAcceptedShowcase(workspaceId, iterationId);
    Respond.View view = load(workspaceId, iterationId, accepted);
    Map<String, Object> next = requireAction(view, "await_human");
    if (!Objects.equals(next.get("candidateId"), input.candidateId())
        || !Objects.equals(next.get("candidateSha256"), input.candidateSha256())
        || !Objects.equals(next.get("authoritySha256"), input.authoritySha256())
        || ((Number) next.get("expectedIterationVersion")).intValue()
            != input.expectedIterationVersion()) {
      throw DomainException.conflict("Respond decision authority has changed");
    }
    Instant timestamp = pairStore.timestamp();
    String id = UUID.randomUUID().toString();
    Map<String, Object> content =
        Pair.map(
            "candidateId", input.candidateId(),
            "action", input.action(),
            "reason", input.reason(),
            "candidateSha256", input.candidateSha256(),
            "authoritySha256", input.authoritySha256(),
            "decidedByUserId", actorUserId,
            "decidedAt", CanonicalJson.instant(timestamp));
    mapper.insertRespondDecision(
        new ExecutionRows.RespondDecisionRow(
            id,
            input.candidateId(),
            input.action(),
            input.reason(),
            input.candidateSha256(),
            input.authoritySha256(),
            actorUserId,
            timestamp,
            CanonicalJson.hash(content)));
    InboxRows.IterationRow iteration = pairStore.requireIteration(workspaceId, iterationId);
    if (!"respond".equals(iteration.loop()) || !"decision".equals(iteration.stage())) {
      throw DomainException.conflict("Respond is not awaiting a human decision");
    }
    pairStore.claimIteration(
        iteration,
        input.expectedIterationVersion(),
        "active",
        "respond",
        "approve".equals(input.action()) ? "accepted" : "drafting",
        timestamp);
    return actionResult(workspaceId, iterationId, id);
  }

  private Respond.View load(
      String workspaceId, String iterationId, ExecutionRows.ShowcaseRunRow showcaseRow) {
    InboxRows.IterationRow iterationRow = pairStore.requireIteration(workspaceId, iterationId);
    Iteration iteration = pairStore.iteration(iterationRow);
    Delivery.Story story = pairStore.story(workspaceId, showcaseRow.storyId());
    Delivery.StoryRevision revision =
        pairStore.storyRevision(workspaceId, showcaseRow.storyId(), showcaseRow.storyRevisionId());
    ExecutionRows.ShowcaseDecisionRow decisionRow = mapper.findShowcaseDecision(showcaseRow.id());
    ExecutionRows.ShowcaseReviewRow reviewRow = mapper.findShowcaseReview(showcaseRow.id());
    if (decisionRow == null
        || reviewRow == null
        || !"accept".equals(decisionRow.action())
        || showcaseRow.evidenceBundleSha256() == null) {
      throw DomainException.internal("Accepted Showcase lost Respond authority");
    }
    Showcase.Run showcase = showcaseStore.run(showcaseRow);
    Showcase.Decision showcaseDecision = showcaseStore.decision(decisionRow);
    Respond.Authority authority =
        Respond.authority(
            showcaseRow.storyRevisionSha256(),
            showcaseRow.approvedTaskingPlanSha256(),
            showcaseRow.pairManifestSha256(),
            showcaseRow.approvedCommitSha(),
            showcaseRow.evidenceBundleSha256(),
            reviewRow.contentSha256(),
            decisionRow.contentSha256());
    List<Respond.Candidate> candidates =
        mapper.findRespondCandidates(workspaceId, iterationId).stream()
            .map(this::candidate)
            .toList();
    List<Respond.Decision> decisions =
        mapper.findRespondDecisions(iterationId).stream().map(this::decision).toList();
    return new Respond.View(
        iteration,
        story,
        revision,
        showcase,
        showcaseDecision,
        authority,
        candidates,
        decisions,
        Respond.nextAction(iteration, authority, showcase, showcaseDecision, candidates));
  }

  private ExecutionRows.ShowcaseRunRow acceptedShowcase(String workspaceId, String iterationId) {
    ExecutionRows.ShowcaseRunRow run = mapper.findLatestShowcase(workspaceId, iterationId);
    return run != null && "accepted".equals(run.stage()) ? run : null;
  }

  private ExecutionRows.ShowcaseRunRow requireAcceptedShowcase(
      String workspaceId, String iterationId) {
    ExecutionRows.ShowcaseRunRow run = acceptedShowcase(workspaceId, iterationId);
    if (run == null) throw DomainException.notFound("Respond " + iterationId + " not found");
    return run;
  }

  private Map<String, Object> requireAction(Respond.View view, String kind) {
    if (view.nextAction() == null || !kind.equals(view.nextAction().get("kind"))) {
      throw DomainException.conflict("Respond action no longer permits " + kind);
    }
    return view.nextAction();
  }

  private Respond.Candidate candidate(ExecutionRows.RespondCandidateRow row) {
    return new Respond.Candidate(
        row.id(),
        row.reference(),
        row.sequence(),
        row.workspaceId(),
        row.iterationId(),
        row.storyId(),
        row.storyRevisionId(),
        row.showcaseRunId(),
        row.showcaseDecisionId(),
        pairStore.read(row.authority(), Respond.Authority.class),
        promotions(row.promotions()),
        row.noPromotionReason(),
        pairStore.strings(row.observedOutcomes()),
        pairStore.strings(row.residualRisks()),
        pairStore.read(row.nextProbe(), Respond.NextProbe.class),
        CanonicalJson.instant(row.proposedAt()),
        row.contentSha256());
  }

  private Respond.Decision decision(ExecutionRows.RespondDecisionRow row) {
    return new Respond.Decision(
        row.id(),
        row.candidateId(),
        row.action(),
        row.reason(),
        row.candidateSha256(),
        row.authoritySha256(),
        row.decidedByUserId(),
        CanonicalJson.instant(row.decidedAt()),
        row.contentSha256());
  }

  private List<Respond.Promotion> promotions(String json) {
    try {
      return objectMapper.readValue(json, PROMOTIONS);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Stored Respond promotions are invalid");
    }
  }

  private Respond.ActionResult actionResult(
      String workspaceId, String iterationId, String acceptedRecordId) {
    ExecutionRows.ShowcaseRunRow showcase = requireAcceptedShowcase(workspaceId, iterationId);
    return new Respond.ActionResult(load(workspaceId, iterationId, showcase), acceptedRecordId);
  }
}
