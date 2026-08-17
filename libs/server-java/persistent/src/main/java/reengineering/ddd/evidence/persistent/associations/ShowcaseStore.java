package reengineering.ddd.evidence.persistent.associations;

import jakarta.inject.Inject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.ApprovedTaskingPlan;
import reengineering.ddd.evidence.domain.model.Delivery;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.domain.model.Pair;
import reengineering.ddd.evidence.domain.model.Showcase;
import reengineering.ddd.evidence.domain.model.Story;
import reengineering.ddd.evidence.domain.model.StoryRevision;
import reengineering.ddd.evidence.persistent.mappers.ExecutionMapper;
import reengineering.ddd.evidence.persistent.mappers.ExecutionRows;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;

@Component
final class ShowcaseStore {
  @Inject private ExecutionMapper mapper;
  @Inject private PairStore pairStore;

  Showcase.View find(String workspaceId, String iterationId) {
    ExecutionRows.ShowcaseRunRow run = mapper.findLatestShowcase(workspaceId, iterationId);
    return run == null ? null : load(workspaceId, run);
  }

  Showcase.ActionResult recordQ2(
      String workspaceId, String iterationId, Showcase.Q2ObservationInput rawInput) {
    Showcase.Q2ObservationInput input = Showcase.normalize(rawInput);
    Context context = requireCurrent(workspaceId, iterationId, input.expectedShowcaseVersion());
    if (!context.run().id().equals(input.showcaseRunId())) {
      throw DomainException.conflict("Showcase Run is no longer current");
    }
    ExecutionRows.ShowcaseQ2Row duplicate =
        mapper.findShowcaseQ2ByAction(context.run().id(), input.actionId());
    if (duplicate != null) return actionResult(workspaceId, iterationId, duplicate.id());
    Map<String, Object> action = requireAction(context.view(), "execute_q2");
    if (!Objects.equals(action.get("actionId"), input.actionId())
        || !Objects.equals(action.get("command"), input.command())
        || !Objects.equals(action.get("approvedCommitSha"), input.approvedCommitSha())) {
      throw DomainException.conflict("Showcase Q2 authority has changed");
    }
    Instant timestamp = pairStore.timestamp();
    List<Showcase.Q2Observation> previous = context.view().q2Observations();
    int sequence = previous.size() + 1;
    @SuppressWarnings("unchecked")
    List<String> scenarioIds = (List<String>) action.get("scenarioIds");
    Map<String, Object> content =
        Pair.map(
            "showcaseRunId", context.run().id(),
            "actionId", input.actionId(),
            "sequence", sequence,
            "testId", action.get("testId"),
            "scenarioIds", scenarioIds,
            "processId", action.get("processId"),
            "stepId", action.get("stepId"),
            "projectId", action.get("projectId"),
            "command", input.command(),
            "termination", input.termination(),
            "exitCode", input.exitCode(),
            "signal", input.signal(),
            "durationMs", input.durationMs(),
            "stdoutSha256", input.stdoutSha256(),
            "stdoutBytes", input.stdoutBytes(),
            "stdoutLines", input.stdoutLines(),
            "stderrSha256", input.stderrSha256(),
            "stderrBytes", input.stderrBytes(),
            "stderrLines", input.stderrLines(),
            "approvedCommitSha", input.approvedCommitSha(),
            "worktreeSha256", input.worktreeSha256(),
            "observedAt", CanonicalJson.instant(timestamp),
            "previousRecordSha256",
                previous.isEmpty() ? null : previous.get(previous.size() - 1).recordSha256());
    ExecutionRows.ShowcaseQ2Row row =
        new ExecutionRows.ShowcaseQ2Row(
            UUID.randomUUID().toString(),
            context.run().id(),
            input.actionId(),
            sequence,
            (String) action.get("testId"),
            pairStore.write(scenarioIds),
            (String) action.get("processId"),
            (String) action.get("stepId"),
            (String) action.get("projectId"),
            input.command(),
            input.termination(),
            input.exitCode(),
            input.signal(),
            input.durationMs(),
            input.stdoutSha256(),
            input.stdoutBytes(),
            input.stdoutLines(),
            input.stderrSha256(),
            input.stderrBytes(),
            input.stderrLines(),
            input.approvedCommitSha(),
            input.worktreeSha256(),
            timestamp,
            previous.isEmpty() ? null : previous.get(previous.size() - 1).recordSha256(),
            CanonicalJson.hash(content));
    mapper.insertShowcaseQ2(row);
    advanceAfterEvidence(context, timestamp);
    return actionResult(workspaceId, iterationId, row.id());
  }

  Showcase.ActionResult recordProduct(
      String workspaceId,
      String iterationId,
      Showcase.ProductObservationInput rawInput,
      String actorUserId) {
    Showcase.ProductObservationInput input = Showcase.normalize(rawInput);
    Context context = requireCurrent(workspaceId, iterationId, input.expectedShowcaseVersion());
    Map<String, Object> action = requireAction(context.view(), "observe_scenario");
    if (!Objects.equals(action.get("scenarioId"), input.scenarioId())) {
      throw DomainException.conflict("Showcase Scenario authority has changed");
    }
    Delivery.Scenario scenario =
        context.view().storyRevision().getDescription().scenarios().stream()
            .filter(candidate -> candidate.id().equals(input.scenarioId()))
            .findFirst()
            .orElseThrow(() -> DomainException.internal("Showcase Scenario snapshot is missing"));
    if (input.observedOutcomes().size() != scenario.then().size()) {
      throw DomainException.validation(
          "Showcase must record one observed outcome for every Then step");
    }
    Instant timestamp = pairStore.timestamp();
    Map<String, Object> content =
        Pair.map(
            "showcaseRunId", context.run().id(),
            "scenarioId", scenario.id(),
            "scenarioReference", scenario.reference(),
            "givenSteps", scenario.given(),
            "whenStep", scenario.when(),
            "expectedThenSteps", scenario.then(),
            "businessData", scenario.businessData(),
            "observedOutcomes", input.observedOutcomes(),
            "observation", input.observation(),
            "valueFeedback", input.valueFeedback(),
            "evidenceRefs", input.evidenceRefs(),
            "observedByUserId", actorUserId,
            "observedAt", CanonicalJson.instant(timestamp));
    ExecutionRows.ShowcaseProductRow row =
        new ExecutionRows.ShowcaseProductRow(
            UUID.randomUUID().toString(),
            context.run().id(),
            scenario.id(),
            scenario.reference(),
            pairStore.write(scenario.given()),
            scenario.when(),
            pairStore.write(scenario.then()),
            pairStore.write(scenario.businessData()),
            pairStore.write(input.observedOutcomes()),
            input.observation(),
            input.valueFeedback(),
            pairStore.write(input.evidenceRefs()),
            actorUserId,
            timestamp,
            CanonicalJson.hash(content));
    mapper.insertShowcaseProduct(row);
    advanceAfterEvidence(context, timestamp);
    return actionResult(workspaceId, iterationId, row.id());
  }

  Showcase.ActionResult recordRisk(
      String workspaceId,
      String iterationId,
      Showcase.RiskDecisionInput rawInput,
      String actorUserId) {
    Showcase.RiskDecisionInput input = Showcase.normalize(rawInput);
    Context context = requireCurrent(workspaceId, iterationId, input.expectedShowcaseVersion());
    Map<String, Object> action = requireAction(context.view(), "decide_risk");
    if (!Objects.equals(action.get("quadrant"), input.quadrant())) {
      throw DomainException.conflict("Showcase risk authority has changed");
    }
    Instant timestamp = pairStore.timestamp();
    Map<String, Object> content =
        Pair.map(
            "showcaseRunId", context.run().id(),
            "quadrant", input.quadrant(),
            "disposition", input.disposition(),
            "activities", input.activities(),
            "reason", input.reason(),
            "decidedByUserId", actorUserId,
            "decidedAt", CanonicalJson.instant(timestamp));
    ExecutionRows.ShowcaseRiskRow row =
        new ExecutionRows.ShowcaseRiskRow(
            UUID.randomUUID().toString(),
            context.run().id(),
            input.quadrant(),
            input.disposition(),
            pairStore.write(input.activities()),
            input.reason(),
            actorUserId,
            timestamp,
            CanonicalJson.hash(content));
    mapper.insertShowcaseRisk(row);
    advanceAfterEvidence(context, timestamp);
    return actionResult(workspaceId, iterationId, row.id());
  }

  Showcase.ActionResult recordEvaluation(
      String workspaceId,
      String iterationId,
      Showcase.EvaluationInput rawInput,
      String actorUserId) {
    Showcase.EvaluationInput input = Showcase.normalize(rawInput);
    Context context = requireCurrent(workspaceId, iterationId, input.expectedShowcaseVersion());
    Map<String, Object> action = requireAction(context.view(), "evaluate_risk");
    if (!Objects.equals(action.get("quadrant"), input.quadrant())
        || !Objects.equals(action.get("activity"), input.activity())) {
      throw DomainException.conflict("Showcase evaluation authority has changed");
    }
    Instant timestamp = pairStore.timestamp();
    int sequence = context.view().evaluations().size() + 1;
    Map<String, Object> content =
        Pair.map(
            "showcaseRunId", context.run().id(),
            "sequence", sequence,
            "quadrant", input.quadrant(),
            "activity", input.activity(),
            "outcome", input.outcome(),
            "finding", input.finding(),
            "evidenceRefs", input.evidenceRefs(),
            "observedByUserId", actorUserId,
            "observedAt", CanonicalJson.instant(timestamp));
    ExecutionRows.ShowcaseEvaluationRow row =
        new ExecutionRows.ShowcaseEvaluationRow(
            UUID.randomUUID().toString(),
            context.run().id(),
            sequence,
            input.quadrant(),
            input.activity(),
            input.outcome(),
            input.finding(),
            pairStore.write(input.evidenceRefs()),
            actorUserId,
            timestamp,
            CanonicalJson.hash(content));
    mapper.insertShowcaseEvaluation(row);
    advanceAfterEvidence(context, timestamp);
    return actionResult(workspaceId, iterationId, row.id());
  }

  Showcase.ActionResult recordReview(
      String workspaceId, String iterationId, Showcase.ReviewInput rawInput) {
    Showcase.ReviewInput input = Showcase.normalize(rawInput);
    Context context = requireCurrent(workspaceId, iterationId, input.expectedShowcaseVersion());
    Map<String, Object> action = requireAction(context.view(), "run_reviewer");
    if (!Objects.equals(action.get("evidenceBundleSha256"), input.evidenceBundleSha256())
        || !Objects.equals(context.run().evidenceBundleSha256(), input.evidenceBundleSha256())) {
      throw DomainException.conflict("Showcase Review evidence has changed");
    }
    Instant timestamp = pairStore.timestamp();
    Map<String, Object> content =
        Pair.map(
            "showcaseRunId", context.run().id(),
            "evidenceBundleSha256", input.evidenceBundleSha256(),
            "observedFacts", input.observedFacts(),
            "productDomainFeedback", input.productDomainFeedback(),
            "technicalQualityFeedback", input.technicalQualityFeedback(),
            "unresolvedAssumptions", input.unresolvedAssumptions(),
            "recommendation", input.recommendation(),
            "reviewedAt", CanonicalJson.instant(timestamp));
    ExecutionRows.ShowcaseReviewRow row =
        new ExecutionRows.ShowcaseReviewRow(
            UUID.randomUUID().toString(),
            context.run().id(),
            input.evidenceBundleSha256(),
            pairStore.write(input.observedFacts()),
            pairStore.write(input.productDomainFeedback()),
            pairStore.write(input.technicalQualityFeedback()),
            pairStore.write(input.unresolvedAssumptions()),
            input.recommendation(),
            timestamp,
            CanonicalJson.hash(content));
    mapper.insertShowcaseReview(row);
    updateRunAndIteration(
        context,
        "decision",
        context.run().evidenceBundleSha256(),
        null,
        "showcase",
        "decision",
        "active",
        timestamp);
    return actionResult(workspaceId, iterationId, row.id());
  }

  Showcase.ActionResult decide(
      String workspaceId, String iterationId, Showcase.DecideInput rawInput, String actorUserId) {
    Showcase.DecideInput input = Showcase.normalize(rawInput);
    Context context = requireCurrent(workspaceId, iterationId, input.expectedShowcaseVersion());
    Map<String, Object> next = context.view().nextAction();
    Showcase.Review review = context.view().review();
    if ("accept".equals(input.action())) {
      if (next == null
          || !"await_human".equals(next.get("kind"))
          || review == null
          || !Objects.equals(input.evidenceBundleSha256(), context.run().evidenceBundleSha256())
          || !Objects.equals(input.reviewSha256(), review.contentSha256())) {
        throw DomainException.conflict("Showcase acceptance evidence is incomplete or stale");
      }
    } else if (next == null
        || !("await_human".equals(next.get("kind"))
            || "resolve_failure".equals(next.get("kind")))) {
      throw DomainException.conflict("Showcase is not ready for a decision");
    }
    if (next != null
        && "await_human".equals(next.get("kind"))
        && (!Objects.equals(input.evidenceBundleSha256(), context.run().evidenceBundleSha256())
            || !Objects.equals(
                input.reviewSha256(), review == null ? null : review.contentSha256()))) {
      throw DomainException.conflict("Showcase decision evidence has changed");
    }
    Instant timestamp = pairStore.timestamp();
    String decisionId = UUID.randomUUID().toString();
    Map<String, Object> content =
        Pair.map(
            "showcaseRunId", context.run().id(),
            "action", input.action(),
            "reason", input.reason(),
            "feedbackTarget", input.feedbackTarget(),
            "evidenceBundleSha256", input.evidenceBundleSha256(),
            "reviewId", review == null ? null : review.id(),
            "decidedByUserId", actorUserId,
            "decidedAt", CanonicalJson.instant(timestamp));
    mapper.insertShowcaseDecision(
        new ExecutionRows.ShowcaseDecisionRow(
            decisionId,
            context.run().id(),
            input.action(),
            input.reason(),
            input.feedbackTarget(),
            input.evidenceBundleSha256(),
            review == null ? null : review.id(),
            actorUserId,
            timestamp,
            CanonicalJson.hash(content)));
    if ("accept".equals(input.action())) {
      updateRunAndIteration(
          context,
          "accepted",
          context.run().evidenceBundleSha256(),
          timestamp,
          "respond",
          "drafting",
          "active",
          timestamp);
    } else if ("reject".equals(input.action())) {
      updateRunAndIteration(
          context,
          "rejected",
          context.run().evidenceBundleSha256(),
          timestamp,
          "showcase",
          "rejected",
          "halted",
          timestamp);
    } else {
      Showcase.FeedbackRoute route = Showcase.FEEDBACK_ROUTES.get(input.feedbackTarget());
      updateRunAndIteration(
          context,
          "revised",
          context.run().evidenceBundleSha256(),
          timestamp,
          route.loop(),
          route.stage(),
          "active",
          timestamp);
      if ("showcase".equals(route.loop())) openAnotherRun(context, timestamp);
    }
    return actionResult(workspaceId, iterationId, decisionId);
  }

  Showcase.Run run(ExecutionRows.ShowcaseRunRow row) {
    return new Showcase.Run(
        row.id(),
        row.reference(),
        row.attempt(),
        row.workspaceId(),
        row.iterationId(),
        row.storyId(),
        row.storyRevisionId(),
        row.storyRevisionSha256(),
        row.approvedTaskingPlanId(),
        row.approvedTaskingPlanSha256(),
        row.pairRunId(),
        row.pairManifestId(),
        row.pairManifestSha256(),
        row.approvedCommitSha(),
        row.stage(),
        row.version(),
        row.evidenceBundleSha256(),
        CanonicalJson.instant(row.startedAt()),
        CanonicalJson.instant(row.updatedAt()),
        row.completedAt() == null ? null : CanonicalJson.instant(row.completedAt()));
  }

  Showcase.Decision decision(ExecutionRows.ShowcaseDecisionRow row) {
    return new Showcase.Decision(
        row.id(),
        row.showcaseRunId(),
        row.action(),
        row.reason(),
        row.feedbackTarget(),
        row.evidenceBundleSha256(),
        row.reviewId(),
        row.decidedByUserId(),
        CanonicalJson.instant(row.decidedAt()),
        row.contentSha256());
  }

  private Showcase.View load(String workspaceId, ExecutionRows.ShowcaseRunRow row) {
    return load(workspaceId, row, true);
  }

  private Showcase.View load(
      String workspaceId, ExecutionRows.ShowcaseRunRow row, boolean includeNextAction) {
    Iteration iteration =
        pairStore.iteration(pairStore.requireIteration(workspaceId, row.iterationId()));
    Story story = pairStore.story(workspaceId, row.storyId());
    StoryRevision revision =
        pairStore.storyRevision(workspaceId, row.storyId(), row.storyRevisionId());
    ApprovedTaskingPlan plan = pairStore.approvedPlan(workspaceId, row.iterationId());
    ExecutionRows.PairRunRow pairRow = mapper.findLatestPair(workspaceId, row.iterationId());
    if (pairRow == null) {
      throw DomainException.internal("Showcase Run " + row.id() + " lost Pair authority");
    }
    ExecutionRows.PairManifestRow manifestRow = mapper.findLatestPairManifest(pairRow.id());
    if (manifestRow == null || !manifestRow.id().equals(row.pairManifestId())) {
      throw DomainException.internal("Showcase Run " + row.id() + " lost Pair authority");
    }
    Pair.Run pairRun = pairStore.pairRun(pairRow);
    Pair.Manifest manifest = pairStore.manifest(manifestRow);
    Showcase.Run run = run(row);
    List<Showcase.Q2Observation> q2 =
        mapper.findShowcaseQ2(row.id()).stream().map(this::q2).toList();
    List<Showcase.ProductObservation> products =
        mapper.findShowcaseProducts(row.id()).stream().map(this::product).toList();
    List<Showcase.RiskDecision> risks =
        mapper.findShowcaseRisks(row.id()).stream().map(this::risk).toList();
    List<Showcase.Evaluation> evaluations =
        mapper.findShowcaseEvaluations(row.id()).stream().map(this::evaluation).toList();
    ExecutionRows.ShowcaseReviewRow reviewRow = mapper.findShowcaseReview(row.id());
    Showcase.Review review = reviewRow == null ? null : review(reviewRow);
    ExecutionRows.ShowcaseDecisionRow decisionRow = mapper.findShowcaseDecision(row.id());
    Showcase.Decision decision = decisionRow == null ? null : decision(decisionRow);
    Showcase.View base =
        new Showcase.View(
            iteration,
            story,
            revision,
            plan,
            pairRun,
            manifest,
            run,
            q2,
            products,
            risks,
            evaluations,
            review,
            decision,
            null);
    if (!includeNextAction) return base;
    return new Showcase.View(
        iteration,
        story,
        revision,
        plan,
        pairRun,
        manifest,
        run,
        q2,
        products,
        risks,
        evaluations,
        review,
        decision,
        Showcase.nextAction(base));
  }

  private Context requireCurrent(String workspaceId, String iterationId, int expectedVersion) {
    ExecutionRows.ShowcaseRunRow run = mapper.findLatestShowcase(workspaceId, iterationId);
    if (run == null) throw DomainException.notFound("Showcase " + iterationId + " not found");
    if (run.version() != expectedVersion) {
      throw DomainException.conflict("Showcase changed; reload before recording evidence");
    }
    return new Context(
        run, load(workspaceId, run), pairStore.requireIteration(workspaceId, iterationId));
  }

  private Map<String, Object> requireAction(Showcase.View view, String kind) {
    if (view.nextAction() == null || !kind.equals(view.nextAction().get("kind"))) {
      throw DomainException.conflict("Showcase action no longer permits " + kind);
    }
    return view.nextAction();
  }

  private void advanceAfterEvidence(Context context, Instant timestamp) {
    Showcase.View refreshed = load(context.run().workspaceId(), context.run(), false);
    if (Showcase.ready(refreshed)) {
      updateRunAndIteration(
          context,
          "reviewing",
          evidenceBundle(refreshed),
          null,
          "showcase",
          "reviewing",
          "active",
          timestamp);
    } else {
      updateRunAndIteration(
          context,
          "setup",
          context.run().evidenceBundleSha256(),
          null,
          "showcase",
          "setup",
          "active",
          timestamp);
    }
  }

  private String evidenceBundle(Showcase.View view) {
    List<Map<String, Object>> entries = new ArrayList<>();
    view.q2Observations()
        .forEach(
            value ->
                entries.add(
                    Pair.map("kind", "q2", "id", value.id(), "sha256", value.recordSha256())));
    view.productObservations()
        .forEach(
            value ->
                entries.add(
                    Pair.map(
                        "kind", "product", "id", value.id(), "sha256", value.contentSha256())));
    view.riskDecisions()
        .forEach(
            value ->
                entries.add(
                    Pair.map("kind", "risk", "id", value.id(), "sha256", value.contentSha256())));
    view.evaluations()
        .forEach(
            value ->
                entries.add(
                    Pair.map(
                        "kind", "evaluation", "id", value.id(), "sha256", value.contentSha256())));
    return CanonicalJson.hash(entries);
  }

  private void updateRunAndIteration(
      Context context,
      String stage,
      String bundle,
      Instant completedAt,
      String iterationLoop,
      String iterationStage,
      String lifecycle,
      Instant timestamp) {
    ExecutionRows.ShowcaseRunRow updated =
        new ExecutionRows.ShowcaseRunRow(
            context.run().id(),
            context.run().reference(),
            context.run().attempt(),
            context.run().workspaceId(),
            context.run().iterationId(),
            context.run().storyId(),
            context.run().storyRevisionId(),
            context.run().storyRevisionSha256(),
            context.run().approvedTaskingPlanId(),
            context.run().approvedTaskingPlanSha256(),
            context.run().pairRunId(),
            context.run().pairManifestId(),
            context.run().pairManifestSha256(),
            context.run().approvedCommitSha(),
            stage,
            context.run().version() + 1,
            bundle,
            context.run().startedAt(),
            timestamp,
            completedAt);
    if (mapper.updateShowcaseRun(updated, context.run().version()) != 1) {
      throw DomainException.conflict("Showcase changed; reload before recording evidence");
    }
    pairStore.claimIteration(
        context.iteration(),
        context.iteration().version(),
        lifecycle,
        iterationLoop,
        iterationStage,
        timestamp);
  }

  private void openAnotherRun(Context context, Instant timestamp) {
    ExecutionRows.ShowcaseRunRow current = context.run();
    int attempt = mapper.countIterationShowcases(current.iterationId()) + 1;
    int sequence = mapper.countShowcaseRuns(current.workspaceId()) + 1;
    mapper.insertShowcaseRun(
        new ExecutionRows.ShowcaseRunRow(
            UUID.randomUUID().toString(),
            "SHOW-" + String.format("%04d", sequence),
            attempt,
            current.workspaceId(),
            current.iterationId(),
            current.storyId(),
            current.storyRevisionId(),
            current.storyRevisionSha256(),
            current.approvedTaskingPlanId(),
            current.approvedTaskingPlanSha256(),
            current.pairRunId(),
            current.pairManifestId(),
            current.pairManifestSha256(),
            current.approvedCommitSha(),
            "setup",
            1,
            null,
            timestamp,
            timestamp,
            null));
  }

  private Showcase.ActionResult actionResult(
      String workspaceId, String iterationId, String acceptedRecordId) {
    ExecutionRows.ShowcaseRunRow run = mapper.findLatestShowcase(workspaceId, iterationId);
    return new Showcase.ActionResult(load(workspaceId, run), acceptedRecordId);
  }

  private Showcase.Q2Observation q2(ExecutionRows.ShowcaseQ2Row row) {
    return new Showcase.Q2Observation(
        row.id(),
        row.showcaseRunId(),
        row.actionId(),
        row.sequence(),
        row.testId(),
        pairStore.strings(row.scenarioIds()),
        row.processId(),
        row.stepId(),
        row.projectId(),
        row.command(),
        row.termination(),
        row.exitCode(),
        row.signal(),
        row.durationMs(),
        row.stdoutSha256(),
        row.stdoutBytes(),
        row.stdoutLines(),
        row.stderrSha256(),
        row.stderrBytes(),
        row.stderrLines(),
        row.approvedCommitSha(),
        row.worktreeSha256(),
        CanonicalJson.instant(row.observedAt()),
        row.previousRecordSha256(),
        row.recordSha256());
  }

  private Showcase.ProductObservation product(ExecutionRows.ShowcaseProductRow row) {
    return new Showcase.ProductObservation(
        row.id(),
        row.showcaseRunId(),
        row.scenarioId(),
        row.scenarioReference(),
        pairStore.strings(row.givenSteps()),
        row.whenStep(),
        pairStore.strings(row.expectedThenSteps()),
        pairStore.strings(row.businessData()),
        pairStore.strings(row.observedOutcomes()),
        row.observation(),
        row.valueFeedback(),
        pairStore.strings(row.evidenceRefs()),
        row.observedByUserId(),
        CanonicalJson.instant(row.observedAt()),
        row.contentSha256());
  }

  private Showcase.RiskDecision risk(ExecutionRows.ShowcaseRiskRow row) {
    return new Showcase.RiskDecision(
        row.id(),
        row.showcaseRunId(),
        row.quadrant(),
        row.disposition(),
        pairStore.strings(row.activities()),
        row.reason(),
        row.decidedByUserId(),
        CanonicalJson.instant(row.decidedAt()),
        row.contentSha256());
  }

  private Showcase.Evaluation evaluation(ExecutionRows.ShowcaseEvaluationRow row) {
    return new Showcase.Evaluation(
        row.id(),
        row.showcaseRunId(),
        row.sequence(),
        row.quadrant(),
        row.activity(),
        row.outcome(),
        row.finding(),
        pairStore.strings(row.evidenceRefs()),
        row.observedByUserId(),
        CanonicalJson.instant(row.observedAt()),
        row.contentSha256());
  }

  private Showcase.Review review(ExecutionRows.ShowcaseReviewRow row) {
    return new Showcase.Review(
        row.id(),
        row.showcaseRunId(),
        row.evidenceBundleSha256(),
        pairStore.strings(row.observedFacts()),
        pairStore.strings(row.productDomainFeedback()),
        pairStore.strings(row.technicalQualityFeedback()),
        pairStore.strings(row.unresolvedAssumptions()),
        row.recommendation(),
        CanonicalJson.instant(row.reviewedAt()),
        row.contentSha256());
  }

  private record Context(
      ExecutionRows.ShowcaseRunRow run, Showcase.View view, InboxRows.IterationRow iteration) {}
}
