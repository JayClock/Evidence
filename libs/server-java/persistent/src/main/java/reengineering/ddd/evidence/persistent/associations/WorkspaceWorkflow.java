package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.core.Ref;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import jakarta.inject.Inject;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.IntSupplier;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.ApprovedTaskingPlanDescription;
import reengineering.ddd.evidence.domain.description.ClarificationDescription;
import reengineering.ddd.evidence.domain.description.DeskCheckDecisionDescription;
import reengineering.ddd.evidence.domain.description.KickoffDecisionDescription;
import reengineering.ddd.evidence.domain.description.KickoffProposalDescription;
import reengineering.ddd.evidence.domain.description.NoModelImpactDescription;
import reengineering.ddd.evidence.domain.description.ProblemStatementDescription;
import reengineering.ddd.evidence.domain.description.ScenarioDraftDescription;
import reengineering.ddd.evidence.domain.description.ScenarioProposalDescription;
import reengineering.ddd.evidence.domain.description.StoryCardDescription;
import reengineering.ddd.evidence.domain.description.StoryRevisionDescription;
import reengineering.ddd.evidence.domain.description.TaskingPlanCandidateDescription;
import reengineering.ddd.evidence.domain.description.UnderstandingDecisionDescription;
import reengineering.ddd.evidence.domain.model.ApprovedTaskingPlan;
import reengineering.ddd.evidence.domain.model.Clarification;
import reengineering.ddd.evidence.domain.model.Delivery;
import reengineering.ddd.evidence.domain.model.DeskCheckDecision;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;
import reengineering.ddd.evidence.domain.model.Iteration;
import reengineering.ddd.evidence.domain.model.IterationWorkflow;
import reengineering.ddd.evidence.domain.model.KickoffDecision;
import reengineering.ddd.evidence.domain.model.KickoffProposal;
import reengineering.ddd.evidence.domain.model.NoModelImpact;
import reengineering.ddd.evidence.domain.model.ProblemStatement;
import reengineering.ddd.evidence.domain.model.ScenarioDraft;
import reengineering.ddd.evidence.domain.model.ScenarioProposal;
import reengineering.ddd.evidence.domain.model.Story;
import reengineering.ddd.evidence.domain.model.StoryCard;
import reengineering.ddd.evidence.domain.model.StoryRevision;
import reengineering.ddd.evidence.domain.model.Tasking;
import reengineering.ddd.evidence.domain.model.TaskingCatalog;
import reengineering.ddd.evidence.domain.model.TaskingPlanCandidate;
import reengineering.ddd.evidence.domain.model.Understanding;
import reengineering.ddd.evidence.domain.model.UnderstandingDecision;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.persistent.mappers.InboxMapper;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;
import reengineering.ddd.evidence.persistent.mappers.WorkflowMapper;
import reengineering.ddd.evidence.persistent.mappers.WorkflowRows;

@AssociationMapping(entity = Workspace.class, field = "workflow", parentIdField = "workspaceId")
public final class WorkspaceWorkflow implements Workspace.WorkflowAssociation {
  private static final TypeReference<Map<String, Object>> OBJECT = new TypeReference<>() {};
  private static final TypeReference<List<Map<String, Object>>> OBJECTS = new TypeReference<>() {};
  private static final TypeReference<List<String>> STRINGS = new TypeReference<>() {};

  private String workspaceId;
  @Inject private WorkflowMapper mapper;
  @Inject private InboxMapper inboxMapper;
  @Inject private ObjectMapper objectMapper;
  @Inject private Clock clock;

  @Override
  public Optional<Iteration> findIteration(String iterationId) {
    return Optional.ofNullable(mapper.findIteration(workspaceId, iterationId)).map(this::iteration);
  }

  @Override
  public Iteration completeProvisioning(
      String iterationId, IterationWorkflow.CompleteProvisioningInput rawInput) {
    IterationWorkflow.CompleteProvisioningInput input = IterationWorkflow.normalize(rawInput);
    InboxRows.IterationRow current = requireIterationRow(iterationId);
    if (!"provisioning".equals(current.lifecycle())) {
      throw DomainException.conflict("Iteration " + iterationId + " is not awaiting provisioning");
    }
    if (!current.baseCommitSha().equals(input.baseCommitSha())) {
      throw DomainException.conflict(
          "Iteration " + iterationId + " base commit does not match its frozen admission");
    }
    if (mapper.completeProvisioning(
            workspaceId,
            iterationId,
            input.expectedVersion(),
            input.baseCommitSha(),
            input.branchName(),
            timestamp())
        != 1) {
      changed(iterationId);
    }
    return requireIteration(iterationId);
  }

  @Override
  public Iteration failProvisioning(
      String iterationId, IterationWorkflow.FailProvisioningInput rawInput) {
    IterationWorkflow.FailProvisioningInput input = IterationWorkflow.normalize(rawInput);
    if (mapper.failProvisioning(
            workspaceId, iterationId, input.expectedVersion(), input.reason(), timestamp())
        != 1) {
      throw DomainException.conflict(
          "Iteration " + iterationId + " is not awaiting provisioning or has changed");
    }
    return requireIteration(iterationId);
  }

  @Override
  public Optional<IterationWorkflow.KickoffView> findKickoff(String iterationId) {
    InboxRows.IterationRow row = mapper.findIteration(workspaceId, iterationId);
    if (row == null) return Optional.empty();
    Iteration domainIteration = iteration(row);
    List<WorkflowRows.KickoffProposalRow> proposals = mapper.findKickoffProposals(iterationId);
    KickoffProposal current = null;
    if ("kickoff".equals(row.loop()) && "candidate_review".equals(row.stage())) {
      for (int index = proposals.size() - 1; index >= 0; index--) {
        WorkflowRows.KickoffProposalRow proposal = proposals.get(index);
        if (proposal.decisionId() == null) {
          current = kickoffProposal(proposal);
          break;
        }
      }
    }
    return Optional.of(
        new IterationWorkflow.KickoffView(
            domainIteration,
            domainIteration.intake().get(),
            current,
            mapper.findKickoffDecisions(iterationId).stream().map(this::kickoffDecision).toList()));
  }

  @Override
  public KickoffProposal proposeKickoffReplacement(
      String iterationId, int expectedIterationVersion, InboxWorkflow.CandidateInput rawProposal) {
    if (expectedIterationVersion <= 0) {
      throw DomainException.validation("Iteration expected version must be positive");
    }
    InboxWorkflow.CandidateData proposal = InboxWorkflow.normalizeCandidate(rawProposal);
    InboxRows.IterationRow iteration = lockIteration(iterationId);
    requireState(iteration, "kickoff", "candidate_drafting", "drafting a Kickoff replacement");
    if (iteration.version() != expectedIterationVersion) changed(iterationId);
    WorkflowRows.IntakeRow intake = requireIntakeRow(iterationId);
    Map<String, Map<String, Object>> sourceByItem = new HashMap<>();
    for (Map<String, Object> source : readObjects(intake.sourceSnapshots())) {
      sourceByItem.put(string(source, "inboxItemId"), source);
    }
    List<Map<String, Object>> citations = new ArrayList<>();
    for (InboxWorkflow.CitationInput citation : proposal.citations()) {
      Map<String, Object> source = sourceByItem.get(citation.inboxItemId());
      if (source == null || !string(source, "contentSha256").equals(citation.revisionSha256())) {
        throw DomainException.conflict(
            "Kickoff Proposal citation is outside Frozen Intake source " + citation.inboxItemId());
      }
      citations.add(
          map(
              "inboxItemId", source.get("inboxItemId"),
              "inboxRevisionId", source.get("inboxRevisionId"),
              "revisionNumber", source.get("revisionNumber"),
              "revisionSha256", source.get("contentSha256"),
              "locator", citation.locator()));
    }
    int sequence = mapper.countKickoffProposals(iterationId) + 1;
    InboxWorkflow.HashedCandidate hashed =
        InboxWorkflow.hashKickoffProposal(proposal, "requirements_analyst", sequence);
    Instant proposedAt = timestamp();
    String id = UUID.randomUUID().toString();
    mapper.insertKickoffProposal(
        id,
        reference("KICKOFF", () -> inboxMapper.allocateKickoffNumber(workspaceId, proposedAt), 4),
        iterationId,
        sequence,
        "requirements_analyst",
        hashed.candidate().title(),
        hashed.candidate().problem(),
        hashed.candidate().role(),
        hashed.candidate().goal(),
        hashed.candidate().value(),
        hashed.candidate().cognitiveMode().wireValue(),
        write(citations),
        hashed.contentSha256(),
        proposedAt);
    claim(
        iterationId,
        expectedIterationVersion,
        "kickoff",
        List.of("candidate_drafting"),
        null,
        null,
        "candidate_review",
        proposedAt);
    WorkflowRows.KickoffProposalRow saved = mapper.findKickoffProposal(iterationId, id);
    if (saved == null)
      throw DomainException.internal("Kickoff Proposal " + id + " was not persisted");
    return kickoffProposal(saved);
  }

  @Override
  public IterationWorkflow.KickoffDecisionResult decideKickoff(
      String iterationId, IterationWorkflow.KickoffDecisionInput rawInput, String decidedByUserId) {
    IterationWorkflow.KickoffDecisionInput input = IterationWorkflow.normalize(rawInput);
    InboxRows.IterationRow iteration = lockIteration(iterationId);
    requireState(iteration, "kickoff", "candidate_review", "reviewing a Kickoff Proposal");
    if (iteration.version() != input.expectedIterationVersion()) changed(iterationId);
    WorkflowRows.KickoffProposalRow proposal =
        mapper.findKickoffProposal(iterationId, input.proposalId());
    if (proposal == null || proposal.decisionId() != null) {
      throw DomainException.conflict(
          "Kickoff Proposal " + input.proposalId() + " is not awaiting a Decision");
    }
    if (!proposal.contentSha256().equals(input.proposalSha256())) {
      throw DomainException.conflict(
          "Kickoff Proposal " + input.proposalId() + " content has changed");
    }
    Instant decidedAt = timestamp();
    String decisionId = UUID.randomUUID().toString();
    String decisionHash =
        CanonicalJson.hash(
            map(
                "iterationId", iterationId,
                "proposalId", input.proposalId(),
                "proposalSha256", input.proposalSha256(),
                "action", input.action().wireValue(),
                "reason", input.reason(),
                "decidedByUserId", decidedByUserId,
                "decidedAt", CanonicalJson.instant(decidedAt)));
    mapper.insertKickoffDecision(
        decisionId,
        reference("DECISION", () -> inboxMapper.allocateDecisionNumber(workspaceId, decidedAt), 4),
        iterationId,
        proposal.id(),
        proposal.contentSha256(),
        input.action().wireValue(),
        input.reason(),
        decidedByUserId,
        decidedAt,
        decisionHash);

    String problemId = null;
    String cardId = null;
    if (input.action() == IterationWorkflow.KickoffAction.CONFIRM) {
      if (iteration.activeStoryId() != null) {
        throw DomainException.conflict(
            "An Iteration cannot create more than one Story during Kickoff");
      }
      String storyId = UUID.randomUUID().toString();
      String revisionId = UUID.randomUUID().toString();
      problemId = UUID.randomUUID().toString();
      cardId = UUID.randomUUID().toString();
      List<Map<String, Object>> storedCitations = readObjects(proposal.citations());
      List<Map<String, Object>> revisionCitations =
          storedCitations.stream()
              .map(
                  citation ->
                      map(
                          "inboxItemId", citation.get("inboxItemId"),
                          "inboxRevisionId", citation.get("inboxRevisionId"),
                          "contentSha256", citation.get("revisionSha256"),
                          "locator", citation.get("locator")))
              .toList();
      String revisionHash =
          CanonicalJson.hash(
              map(
                  "title", proposal.title(),
                  "problem", proposal.problem(),
                  "role", proposal.role(),
                  "goal", proposal.goal(),
                  "value", proposal.value(),
                  "cognitiveMode", proposal.cognitiveMode(),
                  "citations", revisionCitations,
                  "scenarios", List.of()));
      String problemHash =
          CanonicalJson.hash(
              map(
                  "title", proposal.title(),
                  "problem", proposal.problem(),
                  "cognitiveMode", proposal.cognitiveMode(),
                  "citations", storedCitations));
      String cardHash =
          CanonicalJson.hash(
              map(
                  "reference", "US-001",
                  "title", proposal.title(),
                  "role", proposal.role(),
                  "goal", proposal.goal(),
                  "value", proposal.value(),
                  "problemStatementId", problemId));
      mapper.insertStory(storyId, workspaceId, iterationId, decidedAt);
      mapper.insertStoryRevision(
          revisionId,
          storyId,
          1,
          proposal.title(),
          proposal.problem(),
          proposal.role(),
          proposal.goal(),
          proposal.value(),
          proposal.cognitiveMode(),
          revisionHash,
          decidedByUserId,
          decidedAt,
          null);
      for (int position = 0; position < storedCitations.size(); position++) {
        Map<String, Object> citation = storedCitations.get(position);
        mapper.insertStoryCitation(
            UUID.randomUUID().toString(),
            revisionId,
            string(citation, "inboxRevisionId"),
            position,
            string(citation, "locator"));
      }
      if (mapper.initializeStoryRevision(storyId, revisionId) != 1) {
        throw DomainException.internal("Story " + storyId + " was not initialized");
      }
      mapper.insertProblemStatement(
          problemId,
          storyId,
          iterationId,
          proposal.title(),
          proposal.problem(),
          proposal.cognitiveMode(),
          proposal.citations(),
          problemHash,
          decidedAt);
      mapper.insertStoryCard(
          cardId,
          storyId,
          iterationId,
          problemId,
          proposal.title(),
          proposal.role(),
          proposal.goal(),
          proposal.value(),
          cardHash,
          decidedAt);
      claim(
          iterationId,
          input.expectedIterationVersion(),
          "kickoff",
          List.of("candidate_review"),
          null,
          "understand",
          "tqa",
          decidedAt);
    } else if (input.action() == IterationWorkflow.KickoffAction.REVISE) {
      claim(
          iterationId,
          input.expectedIterationVersion(),
          "kickoff",
          List.of("candidate_review"),
          null,
          null,
          "candidate_drafting",
          decidedAt);
    } else {
      claim(
          iterationId,
          input.expectedIterationVersion(),
          "kickoff",
          List.of("candidate_review"),
          "halted",
          null,
          null,
          decidedAt);
    }
    WorkflowRows.KickoffDecisionRow decision =
        mapper.findKickoffDecisions(iterationId).stream()
            .filter(row -> row.id().equals(decisionId))
            .findFirst()
            .orElseThrow(() -> DomainException.internal("Kickoff Decision was not persisted"));
    return new IterationWorkflow.KickoffDecisionResult(
        requireIteration(iterationId),
        kickoffDecision(decision),
        problemId == null ? null : problemStatement(requireProblem(problemId)),
        cardId == null ? null : storyCard(requireCard(cardId)));
  }

  @Override
  public Optional<Understanding.View> findUnderstanding(String iterationId) {
    InboxRows.IterationRow iteration = mapper.findIteration(workspaceId, iterationId);
    if (iteration == null || iteration.activeStoryId() == null) return Optional.empty();
    Story story = requireStory(iteration.activeStoryId());
    StoryRevision revision =
        requireStoryRevision(story.getIdentity(), story.getDescription().latestRevision().id());
    List<Clarification> clarifications =
        mapper.findClarifications(workspaceId, iterationId).stream()
            .map(this::clarification)
            .toList();
    WorkflowRows.ScenarioProposalRow proposal =
        mapper.findCurrentScenarioProposal(workspaceId, iterationId);
    return Optional.of(
        new Understanding.View(
            iteration(iteration),
            story,
            revision,
            clarifications.stream()
                .filter(
                    value ->
                        value.getDescription().status()
                            == Understanding.ClarificationStatus.PENDING)
                .findFirst()
                .orElse(null),
            clarifications,
            proposal == null ? null : scenarioProposal(proposal),
            mapper.findUnderstandingDecisions(workspaceId, iterationId).stream()
                .map(this::understandingDecision)
                .toList()));
  }

  @Override
  public Clarification askClarification(String iterationId, Understanding.AskInput rawInput) {
    Understanding.AskInput input = Understanding.normalize(rawInput);
    Context context = requireContext(iterationId, "Understanding");
    requireTqa(context, input.storyId(), input.storyRevisionId());
    WorkflowRows.ClarificationRow pending =
        mapper.findPendingClarification(workspaceId, iterationId, null);
    if (pending != null) {
      throw DomainException.conflict("Clarification " + pending.reference() + " awaits an answer");
    }
    Instant askedAt = timestamp();
    claim(
        iterationId,
        input.expectedIterationVersion(),
        "understand",
        List.of("tqa"),
        null,
        null,
        null,
        askedAt);
    int sequence = mapper.countClarifications(iterationId) + 1;
    String id = UUID.randomUUID().toString();
    String hash =
        CanonicalJson.hash(
            map(
                "iterationId", iterationId,
                "storyId", input.storyId(),
                "storyRevisionId", input.storyRevisionId(),
                "target", input.target().wireValue(),
                "question", input.question(),
                "askedAt", CanonicalJson.instant(askedAt)));
    mapper.insertClarification(
        id,
        localReference("Q", sequence),
        workspaceId,
        iterationId,
        input.storyId(),
        input.storyRevisionId(),
        sequence,
        input.target().wireValue(),
        input.question(),
        askedAt,
        hash);
    return clarification(mapper.findPendingClarification(workspaceId, iterationId, id));
  }

  @Override
  public Understanding.AnswerResult answerClarification(
      String iterationId, Understanding.AnswerInput rawInput, String answeredByUserId) {
    Understanding.AnswerInput input = Understanding.normalize(rawInput);
    Context context = requireContext(iterationId, "Understanding");
    WorkflowRows.ClarificationRow pending =
        mapper.findPendingClarification(workspaceId, iterationId, input.clarificationId());
    if (pending == null) {
      throw DomainException.conflict(
          "Clarification " + input.clarificationId() + " is not pending");
    }
    requireTqa(context, pending.storyId(), pending.storyRevisionId());
    Instant answeredAt = timestamp();
    String hash =
        CanonicalJson.hash(
            map(
                "questionSha256", pending.contentSha256(),
                "answer", input.answer(),
                "answeredByUserId", answeredByUserId,
                "answeredAt", CanonicalJson.instant(answeredAt)));
    claim(
        iterationId,
        input.expectedIterationVersion(),
        "understand",
        List.of("tqa"),
        null,
        pending.target().equals("story") ? "kickoff" : null,
        pending.target().equals("story") ? "candidate_drafting" : null,
        answeredAt);
    if (mapper.answerClarification(pending.id(), input.answer(), answeredByUserId, answeredAt, hash)
        != 1) {
      changed(iterationId);
    }
    WorkflowRows.ClarificationRow answered =
        mapper.findClarifications(workspaceId, iterationId).stream()
            .filter(value -> value.id().equals(pending.id()))
            .findFirst()
            .orElseThrow(() -> DomainException.internal("Clarification was not persisted"));
    return new Understanding.AnswerResult(requireIteration(iterationId), clarification(answered));
  }

  @Override
  public ScenarioProposal proposeScenarioSet(
      String iterationId, Understanding.ProposeScenariosInput rawInput) {
    Understanding.ProposeScenariosInput input = Understanding.normalize(rawInput);
    Context context = requireContext(iterationId, "Understanding");
    requireTqa(context, input.storyId(), input.storyRevisionId());
    WorkflowRows.ClarificationRow pending =
        mapper.findPendingClarification(workspaceId, iterationId, null);
    if (pending != null) {
      throw DomainException.conflict(
          "Clarification " + pending.reference() + " must be answered first");
    }
    Instant proposedAt = timestamp();
    claim(
        iterationId,
        input.expectedIterationVersion(),
        "understand",
        List.of("tqa"),
        null,
        null,
        "scenario_review",
        proposedAt);
    int sequence = mapper.countScenarioProposals(iterationId) + 1;
    String proposalId = UUID.randomUUID().toString();
    List<DraftValue> drafts = new ArrayList<>();
    for (int position = 0; position < input.scenarios().size(); position++) {
      Understanding.ScenarioInput scenario = input.scenarios().get(position);
      Map<String, Object> content = scenarioMap(scenario);
      drafts.add(
          new DraftValue(
              UUID.randomUUID().toString(),
              localReference("DRAFT", position + 1),
              position,
              scenario,
              CanonicalJson.hash(content)));
    }
    String proposalHash =
        CanonicalJson.hash(
            map(
                "iterationId", iterationId,
                "storyId", input.storyId(),
                "storyRevisionId", input.storyRevisionId(),
                "sequence", sequence,
                "drafts",
                    drafts.stream()
                        .map(
                            draft -> {
                              Map<String, Object> value = new LinkedHashMap<>();
                              value.put("reference", draft.reference());
                              value.put("position", draft.position());
                              value.putAll(scenarioMap(draft.scenario()));
                              value.put("contentSha256", draft.contentSha256());
                              return value;
                            })
                        .toList()));
    mapper.insertScenarioProposal(
        proposalId,
        localReference("SP", sequence),
        workspaceId,
        iterationId,
        input.storyId(),
        input.storyRevisionId(),
        sequence,
        proposalHash,
        proposedAt);
    for (DraftValue draft : drafts) {
      mapper.insertScenarioDraft(
          draft.id(),
          draft.reference(),
          proposalId,
          draft.position(),
          draft.scenario().title(),
          write(draft.scenario().given()),
          draft.scenario().when(),
          write(draft.scenario().then()),
          write(draft.scenario().businessData()),
          draft.contentSha256());
    }
    return scenarioProposal(mapper.findScenarioProposal(workspaceId, iterationId, proposalId));
  }

  @Override
  public Understanding.DecisionResult decideUnderstanding(
      String iterationId, Understanding.DecideInput rawInput, String decidedByUserId) {
    Understanding.DecideInput input = Understanding.normalize(rawInput);
    Context context = requireContext(iterationId, "Understanding");
    if (!"active".equals(context.iteration().lifecycle())
        || !"understand".equals(context.iteration().loop())) {
      throw DomainException.conflict("Iteration " + iterationId + " is not in Understand");
    }
    WorkflowRows.ScenarioProposalRow proposal =
        input.proposalId() == null
            ? null
            : mapper.findScenarioProposal(workspaceId, iterationId, input.proposalId());
    if (input.action() == Understanding.DecisionAction.CONFIRM
        || input.action() == Understanding.DecisionAction.CONTINUE) {
      if (proposal == null
          || proposal.decisionId() != null
          || !proposal.contentSha256().equals(input.proposalSha256())) {
        throw DomainException.conflict("Scenario Proposal has changed");
      }
      if (!"scenario_review".equals(context.iteration().stage())) {
        throw DomainException.conflict("No Scenario Proposal awaits a decision");
      }
    }
    List<WorkflowRows.ScenarioDraftRow> allDrafts =
        proposal == null ? List.of() : mapper.findScenarioDrafts(proposal.id());
    List<WorkflowRows.ScenarioDraftRow> selected = new ArrayList<>();
    for (String id : input.selectedDraftIds()) {
      WorkflowRows.ScenarioDraftRow draft =
          allDrafts.stream()
              .filter(value -> value.id().equals(id))
              .findFirst()
              .orElseThrow(() -> DomainException.validation("Unknown Scenario Draft " + id));
      selected.add(draft);
    }
    if (input.action() == Understanding.DecisionAction.CONFIRM
        && proposal != null
        && selected.size() < allDrafts.size()
        && input.reason() == null) {
      throw DomainException.validation(
          "Confirming an incomplete Proposal requires an omission reason");
    }
    Instant decidedAt = timestamp();
    String newLifecycle =
        input.action() == Understanding.DecisionAction.SPLIT
                || input.action() == Understanding.DecisionAction.DEFER
            ? "halted"
            : null;
    String newStage = input.action() == Understanding.DecisionAction.CONTINUE ? "tqa" : null;
    claim(
        iterationId,
        input.expectedIterationVersion(),
        "understand",
        input.action() == Understanding.DecisionAction.CONFIRM
                || input.action() == Understanding.DecisionAction.CONTINUE
            ? List.of("scenario_review")
            : List.of("tqa", "scenario_review"),
        newLifecycle,
        null,
        newStage,
        decidedAt);
    if (newLifecycle != null) {
      mapper.waiveClarifications(iterationId, input.reason(), decidedByUserId, decidedAt);
    }
    int scenarioBase = mapper.countStoryScenarios(context.story().getIdentity());
    List<ScenarioValue> scenarios = new ArrayList<>();
    for (int index = 0; index < selected.size(); index++) {
      scenarios.add(
          new ScenarioValue(
              UUID.randomUUID().toString(),
              localReference("SC", scenarioBase + index + 1),
              selected.get(index)));
    }
    String decisionId = UUID.randomUUID().toString();
    int sequence = mapper.countUnderstandingDecisions(iterationId) + 1;
    String decisionHash =
        CanonicalJson.hash(
            map(
                "iterationId", iterationId,
                "storyId", context.story().getIdentity(),
                "storyRevisionId", context.revision().getIdentity(),
                "proposalId", proposal == null ? null : proposal.id(),
                "proposalSha256", proposal == null ? null : proposal.contentSha256(),
                "action", input.action().wireValue(),
                "reason", input.reason(),
                "selectedDraftIds",
                    selected.stream().map(WorkflowRows.ScenarioDraftRow::id).toList(),
                "confirmedScenarioIds", scenarios.stream().map(ScenarioValue::id).toList(),
                "decidedByUserId", decidedByUserId,
                "decidedAt", CanonicalJson.instant(decidedAt)));
    mapper.insertUnderstandingDecision(
        decisionId,
        localReference("UD", sequence),
        workspaceId,
        iterationId,
        context.story().getIdentity(),
        context.revision().getIdentity(),
        proposal == null ? null : proposal.id(),
        proposal == null ? null : proposal.contentSha256(),
        input.action().wireValue(),
        input.reason(),
        write(selected.stream().map(WorkflowRows.ScenarioDraftRow::id).toList()),
        write(scenarios.stream().map(ScenarioValue::id).toList()),
        decidedByUserId,
        decidedAt,
        decisionHash);

    StoryRevision createdRevision = null;
    if (input.action() == Understanding.DecisionAction.CONFIRM) {
      StoryRevisionDescription current = context.revision().getDescription();
      String revisionId = UUID.randomUUID().toString();
      int revisionNumber = current.revisionNumber() + 1;
      List<Map<String, Object>> revisionCitations =
          current.citations().stream()
              .map(
                  citation ->
                      map(
                          "inboxRevisionId", citation.inboxRevision().id(),
                          "locator", citation.locator()))
              .toList();
      List<Map<String, Object>> scenarioContent =
          scenarios.stream()
              .map(
                  scenario ->
                      map(
                          "reference", scenario.reference(),
                          "title", scenario.draft().title(),
                          "given", readStrings(scenario.draft().givenSteps()),
                          "when", scenario.draft().whenStep(),
                          "then", readStrings(scenario.draft().thenSteps()),
                          "businessData", readStrings(scenario.draft().businessData())))
              .toList();
      String revisionHash =
          CanonicalJson.hash(
              map(
                  "title", current.title(),
                  "problem", current.problem(),
                  "role", current.role(),
                  "goal", current.goal(),
                  "value", current.value(),
                  "cognitiveMode", current.cognitiveMode().wireValue(),
                  "citations", revisionCitations,
                  "scenarios", scenarioContent));
      mapper.insertStoryRevision(
          revisionId,
          context.story().getIdentity(),
          revisionNumber,
          current.title(),
          current.problem(),
          current.role(),
          current.goal(),
          current.value(),
          current.cognitiveMode().wireValue(),
          revisionHash,
          decidedByUserId,
          decidedAt,
          decisionId);
      for (int position = 0; position < current.citations().size(); position++) {
        Delivery.Citation citation = current.citations().get(position);
        mapper.insertStoryCitation(
            UUID.randomUUID().toString(),
            revisionId,
            citation.inboxRevision().id(),
            position,
            citation.locator());
      }
      for (int position = 0; position < scenarios.size(); position++) {
        ScenarioValue scenario = scenarios.get(position);
        mapper.insertStoryScenario(
            scenario.id(),
            scenario.reference(),
            revisionId,
            scenario.draft().id(),
            decisionId,
            position,
            scenario.draft().title(),
            scenario.draft().givenSteps(),
            scenario.draft().whenStep(),
            scenario.draft().thenSteps(),
            scenario.draft().businessData(),
            decidedAt);
      }
      if (mapper.setLatestStoryRevision(
              workspaceId,
              context.story().getIdentity(),
              context.story().getDescription().version(),
              context.revision().getIdentity(),
              revisionId,
              decidedAt)
          != 1) {
        changed(iterationId);
      }
      mapper.updateIterationStage(workspaceId, iterationId, "modeling", decidedAt);
      createdRevision = requireStoryRevision(context.story().getIdentity(), revisionId);
    }
    WorkflowRows.UnderstandingDecisionRow decision =
        mapper.findUnderstandingDecisions(workspaceId, iterationId).stream()
            .filter(value -> value.id().equals(decisionId))
            .findFirst()
            .orElseThrow(
                () -> DomainException.internal("Understanding Decision was not persisted"));
    return new Understanding.DecisionResult(
        requireIteration(iterationId), understandingDecision(decision), createdRevision);
  }

  @Override
  public Optional<Tasking.View> findTasking(String iterationId) {
    InboxRows.IterationRow iteration = mapper.findIteration(workspaceId, iterationId);
    if (iteration == null || iteration.activeStoryId() == null) return Optional.empty();
    Story story = requireStory(iteration.activeStoryId());
    StoryRevision revision =
        requireStoryRevision(story.getIdentity(), story.getDescription().latestRevision().id());
    WorkflowRows.NoModelImpactRow noModel =
        mapper.findNoModelImpact(workspaceId, iterationId, revision.getIdentity());
    WorkflowRows.TaskingCandidateRow candidate =
        mapper.findCurrentTaskingCandidate(workspaceId, iterationId);
    WorkflowRows.ApprovedPlanRow approved = mapper.findApprovedPlan(workspaceId, iterationId);
    return Optional.of(
        new Tasking.View(
            iteration(iteration),
            story,
            revision,
            noModel == null ? null : noModelImpact(noModel),
            candidate == null ? null : taskingCandidate(candidate),
            mapper.findDeskCheckDecisions(workspaceId, iterationId).stream()
                .map(this::deskDecision)
                .toList(),
            approved == null ? null : approvedPlan(approved),
            TaskingCatalog.PROCESSES));
  }

  @Override
  public NoModelImpact recordNoModelImpact(
      String iterationId, Tasking.RecordNoModelImpactInput rawInput, String decidedByUserId) {
    Tasking.RecordNoModelImpactInput input = Tasking.normalize(rawInput);
    Context context = requireContext(iterationId, "Tasking");
    WorkflowRows.NoModelImpactRow existing =
        mapper.findNoModelImpactByRevision(input.storyRevisionId());
    if (existing != null) {
      if (existing.iterationId().equals(iterationId)
          && existing.storyId().equals(input.storyId())
          && existing.storyRevisionSha256().equals(input.storyRevisionSha256())
          && existing.reason().equals(input.reason())
          && existing.decidedByUserId().equals(decidedByUserId)) {
        return noModelImpact(existing);
      }
      throw DomainException.conflict(
          "Story Revision " + input.storyRevisionId() + " already has a No Model Impact Decision");
    }
    requireModeling(context, input);
    Instant decidedAt = timestamp();
    claim(
        iterationId,
        input.expectedIterationVersion(),
        "understand",
        List.of("modeling"),
        null,
        "tasking",
        "drafting",
        decidedAt);
    String id = UUID.randomUUID().toString();
    int sequence = mapper.countNoModelImpact(iterationId) + 1;
    String hash =
        CanonicalJson.hash(
            map(
                "iterationId",
                iterationId,
                "storyId",
                context.story().getIdentity(),
                "storyRevisionId",
                context.revision().getIdentity(),
                "storyRevisionSha256",
                context.revision().getDescription().contentSha256(),
                "subject",
                "tool",
                "method",
                "none",
                "modelChangeRequired",
                false,
                "reason",
                input.reason(),
                "decidedByUserId",
                decidedByUserId,
                "decidedAt",
                CanonicalJson.instant(decidedAt)));
    mapper.insertNoModelImpact(
        id,
        localReference("NMI", sequence),
        workspaceId,
        iterationId,
        context.story().getIdentity(),
        context.revision().getIdentity(),
        context.revision().getDescription().contentSha256(),
        input.reason(),
        decidedByUserId,
        decidedAt,
        hash);
    return noModelImpact(mapper.findNoModelImpactByRevision(input.storyRevisionId()));
  }

  @Override
  public TaskingPlanCandidate proposeTasking(String iterationId, Tasking.ProposeInput rawInput) {
    Context context = requireContext(iterationId, "Tasking");
    WorkflowRows.NoModelImpactRow noModel =
        mapper.findNoModelImpact(workspaceId, iterationId, context.revision().getIdentity());
    if (noModel == null) {
      throw DomainException.conflict("Tasking requires an immutable No Model Impact Decision");
    }
    List<Tasking.AuthorityScenario> scenarios =
        context.revision().getDescription().scenarios().stream()
            .map(
                scenario ->
                    new Tasking.AuthorityScenario(
                        scenario.reference(),
                        scenario.title(),
                        scenario.given(),
                        scenario.when(),
                        scenario.then(),
                        scenario.businessData()))
            .toList();
    Tasking.ValidatedDraft draft = Tasking.validate(rawInput, scenarios);
    Tasking.ProposeInput input = draft.input();
    requireDrafting(context, input, noModel);
    Instant proposedAt = timestamp();
    claim(
        iterationId,
        input.expectedIterationVersion(),
        "tasking",
        List.of("drafting", "knowledge_gap"),
        null,
        null,
        "desk_check",
        proposedAt);
    int sequence = mapper.countTaskingCandidates(iterationId) + 1;
    String id = UUID.randomUUID().toString();
    String reference = localReference("TASKING", sequence);
    String projectHash = CanonicalJson.hash(jsonValue(draft.projectCatalog()));
    List<Tasking.ProcessSelection> processes = new ArrayList<>();
    for (Tasking.ValidatedRuntime runtime : draft.runtimes()) {
      Map<String, Object> selection =
          map(
              "runtimePlanId", runtime.input().id(),
              "processId", runtime.process().id(),
              "processVersion", runtime.process().version(),
              "definitionSha256", CanonicalJson.hash(jsonValue(runtime.process())),
              "functionalContexts", runtime.input().functionalContexts(),
              "technicalBoundaries", runtime.input().technicalBoundaries(),
              "selectedStepIds", runtime.selectedStepIds(),
              "projectIds", runtime.input().projectIds(),
              "projectCatalogSha256", projectHash,
              "focusedCommands", jsonValue(runtime.focusedCommands()),
              "qualityGates", jsonValue(runtime.qualityGates()));
      processes.add(
          new Tasking.ProcessSelection(
              runtime.input().id(),
              runtime.process().id(),
              runtime.process().version(),
              string(selection, "definitionSha256"),
              runtime.input().functionalContexts(),
              runtime.input().technicalBoundaries(),
              runtime.selectedStepIds(),
              runtime.input().projectIds(),
              projectHash,
              runtime.focusedCommands(),
              runtime.qualityGates(),
              CanonicalJson.hash(selection)));
    }
    Tasking.ExecutionBudget budget =
        Tasking.budget(
            draft.tests().size(),
            processes.stream().mapToInt(value -> value.selectedStepIds().size()).sum(),
            processes.stream().mapToInt(value -> value.qualityGates().size()).sum(),
            CanonicalJson.hash(jsonValue(TaskingCatalog.PAIR_EXECUTION_POLICY)));
    StoredTaskingPayload payload =
        new StoredTaskingPayload(
            2, draft.projectCatalog(), draft.tests(), draft.tasks(), processes, budget);
    Map<String, Object> candidateContent =
        map(
            "reference", reference,
            "iterationId", iterationId,
            "storyId", context.story().getIdentity(),
            "storyRevisionId", context.revision().getIdentity(),
            "storyRevisionSha256", context.revision().getDescription().contentSha256(),
            "baseCommitSha", context.iteration().baseCommitSha(),
            "noModelImpactDecisionId", noModel.id(),
            "noModelImpactDecisionSha256", noModel.contentSha256(),
            "sequence", sequence,
            "planVersion", 2,
            "projectCatalog", jsonValue(payload.projectCatalog()),
            "tests", jsonValue(payload.tests()),
            "tasks", jsonValue(payload.tasks()),
            "processes", jsonValue(payload.processes()),
            "executionBudget", jsonValue(payload.executionBudget()),
            "projectCatalogSha256", projectHash,
            "proposedBy", "tasking-analyst",
            "proposedAt", CanonicalJson.instant(proposedAt));
    String contentHash = CanonicalJson.hash(candidateContent);
    mapper.insertTaskingCandidate(
        id,
        reference,
        workspaceId,
        iterationId,
        context.story().getIdentity(),
        context.revision().getIdentity(),
        context.revision().getDescription().contentSha256(),
        context.iteration().baseCommitSha(),
        noModel.id(),
        noModel.contentSha256(),
        sequence,
        projectHash,
        write(payload),
        contentHash,
        proposedAt);
    return taskingCandidate(mapper.findTaskingCandidate(workspaceId, iterationId, id));
  }

  @Override
  public Tasking.DecisionResult decideTasking(
      String iterationId, Tasking.DecideInput rawInput, String decidedByUserId) {
    Tasking.DecideInput input = Tasking.normalize(rawInput);
    Context context = requireContext(iterationId, "Tasking");
    if (!"active".equals(context.iteration().lifecycle())
        || !"tasking".equals(context.iteration().loop())
        || !"desk_check".equals(context.iteration().stage())) {
      throw DomainException.conflict("Iteration " + iterationId + " is not in Tasking/Desk Check");
    }
    WorkflowRows.TaskingCandidateRow candidate =
        mapper.findTaskingCandidate(workspaceId, iterationId, input.candidateId());
    if (candidate == null || candidate.decisionId() != null) {
      throw DomainException.notFound("Tasking Candidate " + input.candidateId() + " not found");
    }
    if (!candidate.contentSha256().equals(input.candidateSha256())) {
      throw DomainException.conflict(
          "Tasking Candidate " + input.candidateId() + " content has changed");
    }
    if (!candidate.storyRevisionId().equals(context.revision().getIdentity())
        || !candidate
            .storyRevisionSha256()
            .equals(context.revision().getDescription().contentSha256())
        || !candidate.baseCommitSha().equals(context.iteration().baseCommitSha())) {
      throw DomainException.conflict("Tasking Candidate authority no longer matches the Iteration");
    }
    WorkflowRows.NoModelImpactRow noModel =
        mapper.findNoModelImpactByRevision(candidate.storyRevisionId());
    if (noModel == null
        || !noModel.id().equals(candidate.noModelImpactDecisionId())
        || !noModel.contentSha256().equals(candidate.noModelImpactDecisionSha256())) {
      throw DomainException.conflict("Tasking Candidate No Model Impact authority has changed");
    }
    revalidate(candidate, context.revision());
    Instant decidedAt = timestamp();
    String nextLoop = input.action() == Tasking.DeskCheckAction.SCENARIO_GAP ? "understand" : null;
    String nextStage =
        switch (input.action()) {
          case APPROVE -> "approved";
          case REVISE -> "drafting";
          case ARCHITECTURE_GAP, PROCESS_GAP -> "knowledge_gap";
          case SCENARIO_GAP -> "tqa";
        };
    claim(
        iterationId,
        input.expectedIterationVersion(),
        "tasking",
        List.of("desk_check"),
        null,
        nextLoop,
        nextStage,
        decidedAt);
    String decisionId = UUID.randomUUID().toString();
    int sequence = mapper.countDeskCheckDecisions(iterationId) + 1;
    String decisionHash =
        CanonicalJson.hash(
            map(
                "iterationId", iterationId,
                "candidateId", candidate.id(),
                "candidateSha256", candidate.contentSha256(),
                "action", input.action().wireValue(),
                "reason", input.reason(),
                "decidedByUserId", decidedByUserId,
                "decidedAt", CanonicalJson.instant(decidedAt)));
    mapper.insertDeskCheckDecision(
        decisionId,
        localReference("DC", sequence),
        workspaceId,
        iterationId,
        candidate.id(),
        candidate.contentSha256(),
        input.action().wireValue(),
        input.reason(),
        decidedByUserId,
        decidedAt,
        decisionHash);
    ApprovedTaskingPlan plan = null;
    if (input.action() == Tasking.DeskCheckAction.APPROVE) {
      StoredTaskingPayload candidatePayload = read(candidate.payload(), StoredTaskingPayload.class);
      StoredApprovedPayload approvedPayload =
          new StoredApprovedPayload(
              candidate.reference(),
              candidate.storyRevisionSha256(),
              candidate.baseCommitSha(),
              candidate.noModelImpactDecisionId(),
              candidate.noModelImpactDecisionSha256(),
              candidate.sequence(),
              candidate.projectCatalogSha256(),
              candidatePayload.planVersion(),
              candidatePayload.projectCatalog(),
              candidatePayload.tests(),
              candidatePayload.tasks(),
              candidatePayload.processes(),
              candidatePayload.executionBudget(),
              candidate.contentSha256(),
              CanonicalJson.instant(candidate.proposedAt()));
      String planId = UUID.randomUUID().toString();
      String planHash =
          CanonicalJson.hash(
              map(
                  "iterationId", iterationId,
                  "storyId", candidate.storyId(),
                  "storyRevisionId", candidate.storyRevisionId(),
                  "taskingCandidateId", candidate.id(),
                  "taskingCandidateSha256", candidate.contentSha256(),
                  "deskCheckDecisionId", decisionId,
                  "deskCheckDecisionSha256", decisionHash,
                  "plan", jsonValue(approvedPayload),
                  "approvedByUserId", decidedByUserId,
                  "approvedAt", CanonicalJson.instant(decidedAt)));
      mapper.insertApprovedPlan(
          planId,
          workspaceId,
          iterationId,
          candidate.storyId(),
          candidate.storyRevisionId(),
          candidate.id(),
          decisionId,
          write(approvedPayload),
          planHash,
          decidedByUserId,
          decidedAt);
      plan = approvedPlan(mapper.findApprovedPlan(workspaceId, iterationId));
    }
    WorkflowRows.DeskCheckDecisionRow decision =
        mapper.findDeskCheckDecisions(workspaceId, iterationId).stream()
            .filter(value -> value.id().equals(decisionId))
            .findFirst()
            .orElseThrow(() -> DomainException.internal("Desk Check Decision was not persisted"));
    return new Tasking.DecisionResult(requireIteration(iterationId), deskDecision(decision), plan);
  }

  private Context requireContext(String iterationId, String label) {
    InboxRows.IterationRow iteration = mapper.findIteration(workspaceId, iterationId);
    if (iteration == null || iteration.activeStoryId() == null) {
      throw DomainException.notFound(label + " " + iterationId + " not found");
    }
    Story story = requireStory(iteration.activeStoryId());
    StoryRevision revision =
        requireStoryRevision(story.getIdentity(), story.getDescription().latestRevision().id());
    return new Context(iteration, story, revision);
  }

  private void requireTqa(Context context, String storyId, String storyRevisionId) {
    if (!"active".equals(context.iteration().lifecycle())
        || !"understand".equals(context.iteration().loop())
        || !"tqa".equals(context.iteration().stage())) {
      throw DomainException.conflict(
          "Iteration " + context.iteration().id() + " is not in Understand/TQA");
    }
    if (!context.story().getIdentity().equals(storyId)
        || !context.revision().getIdentity().equals(storyRevisionId)) {
      throw DomainException.conflict("The active Story Revision has changed");
    }
  }

  private void requireModeling(Context context, Tasking.RecordNoModelImpactInput input) {
    if (!"active".equals(context.iteration().lifecycle())
        || !"understand".equals(context.iteration().loop())
        || !"modeling".equals(context.iteration().stage())) {
      throw DomainException.conflict(
          "Iteration " + context.iteration().id() + " is not in Understand/Modeling");
    }
    if (!context.story().getIdentity().equals(input.storyId())
        || !context.revision().getIdentity().equals(input.storyRevisionId())
        || !context
            .revision()
            .getDescription()
            .contentSha256()
            .equals(input.storyRevisionSha256())) {
      throw DomainException.conflict("The active Story Revision has changed");
    }
    if (context.revision().getDescription().scenarios().isEmpty()) {
      throw DomainException.conflict("No Model Impact requires a confirmed Story Scenario Set");
    }
  }

  private void requireDrafting(
      Context context, Tasking.ProposeInput input, WorkflowRows.NoModelImpactRow noModel) {
    if (!"active".equals(context.iteration().lifecycle())
        || !"tasking".equals(context.iteration().loop())
        || !("drafting".equals(context.iteration().stage())
            || "knowledge_gap".equals(context.iteration().stage()))) {
      throw DomainException.conflict(
          "Iteration " + context.iteration().id() + " is not in Tasking/Drafting");
    }
    if (!context.story().getIdentity().equals(input.storyId())
        || !context.revision().getIdentity().equals(input.storyRevisionId())
        || !noModel.id().equals(input.noModelImpactDecisionId())
        || !noModel.contentSha256().equals(input.noModelImpactDecisionSha256())) {
      throw DomainException.conflict("Tasking authority has changed");
    }
  }

  private void revalidate(WorkflowRows.TaskingCandidateRow candidate, StoryRevision revision) {
    StoredTaskingPayload payload = read(candidate.payload(), StoredTaskingPayload.class);
    if (payload.planVersion() != 2) {
      throw DomainException.conflict("Tasking Candidate is not a v2 Pair plan");
    }
    Map<String, TaskingCatalog.Process> processDefinitions = new HashMap<>();
    for (Tasking.ProcessSelection process : payload.processes()) {
      TaskingCatalog.Process definition =
          TaskingCatalog.PROCESSES.stream()
              .filter(value -> value.id().equals(process.processId()))
              .findFirst()
              .orElseThrow(
                  () ->
                      DomainException.conflict(
                          "Tasking process " + process.processId() + " is no longer available"));
      processDefinitions.put(process.runtimePlanId(), definition);
    }
    List<Tasking.AuthorityScenario> scenarios =
        revision.getDescription().scenarios().stream()
            .map(
                scenario ->
                    new Tasking.AuthorityScenario(
                        scenario.reference(),
                        scenario.title(),
                        scenario.given(),
                        scenario.when(),
                        scenario.then(),
                        scenario.businessData()))
            .toList();
    Tasking.ProposeInput raw =
        new Tasking.ProposeInput(
            1,
            candidate.storyId(),
            candidate.storyRevisionId(),
            candidate.noModelImpactDecisionId(),
            candidate.noModelImpactDecisionSha256(),
            payload.projectCatalog(),
            payload.processes().stream()
                .map(
                    process ->
                        new Tasking.RuntimeInput(
                            process.runtimePlanId(),
                            processDefinitions.get(process.runtimePlanId()).runtime(),
                            process.functionalContexts(),
                            process.technicalBoundaries(),
                            process.projectIds()))
                .toList(),
            payload.tests().stream()
                .map(
                    test ->
                        new Tasking.TestInput(
                            test.id(),
                            test.quadrant(),
                            test.intent(),
                            test.runtimePlanId(),
                            test.stepId(),
                            test.projectId(),
                            test.testFilter(),
                            test.supportedBy(),
                            test.scenarioIds(),
                            test.scenarioOutcome(),
                            test.businessData(),
                            test.modelRefs()))
                .toList(),
            payload.tasks().stream()
                .map(
                    task ->
                        new Tasking.TaskInput(
                            task.id(), task.description(), task.testIds(), task.dependsOn()))
                .toList());
    Tasking.ValidatedDraft validated = Tasking.validate(raw, scenarios);
    String catalogHash = CanonicalJson.hash(jsonValue(payload.projectCatalog()));
    if (!catalogHash.equals(candidate.projectCatalogSha256())) {
      throw DomainException.conflict("Tasking Nx project catalog hash has changed");
    }
    Tasking.ExecutionBudget expected =
        Tasking.budget(
            validated.tests().size(),
            validated.runtimes().stream().mapToInt(value -> value.selectedStepIds().size()).sum(),
            validated.runtimes().stream().mapToInt(value -> value.qualityGates().size()).sum(),
            CanonicalJson.hash(jsonValue(TaskingCatalog.PAIR_EXECUTION_POLICY)));
    if (!CanonicalJson.hash(jsonValue(expected))
        .equals(CanonicalJson.hash(jsonValue(payload.executionBudget())))) {
      throw DomainException.conflict("Tasking Pair execution budget has changed");
    }
    for (Tasking.ProcessSelection process : payload.processes()) {
      TaskingCatalog.Process definition = processDefinitions.get(process.runtimePlanId());
      if (!CanonicalJson.hash(jsonValue(definition)).equals(process.definitionSha256())) {
        throw DomainException.conflict(
            "Tasking process " + process.processId() + " definition has changed");
      }
      Map<String, Object> materialized = processMap(process, false);
      if (!CanonicalJson.hash(materialized).equals(process.materializedSha256())) {
        throw DomainException.conflict(
            "Tasking process " + process.processId() + " materialization has changed");
      }
    }
  }

  private Iteration iteration(InboxRows.IterationRow row) {
    return IterationEntities.iteration(
        row, new IterationIntakeAssociation(row.id(), mapper, objectMapper));
  }

  private IterationWorkflow.FrozenCitation frozenCitation(Map<String, Object> value) {
    return new IterationWorkflow.FrozenCitation(
        new Ref<>(string(value, "inboxItemId")),
        new Ref<>(string(value, "inboxRevisionId")),
        integer(value, "revisionNumber"),
        string(value, "revisionSha256"),
        string(value, "locator"));
  }

  private KickoffProposal kickoffProposal(WorkflowRows.KickoffProposalRow row) {
    return new KickoffProposal(
        row.id(),
        new KickoffProposalDescription(
            row.reference(),
            new Ref<>(row.iterationId()),
            row.sequence(),
            IterationWorkflow.ProposalOrigin.parseStored(row.origin()),
            row.title(),
            row.problem(),
            row.role(),
            row.goal(),
            row.value(),
            InboxWorkflow.CognitiveMode.parseStored(row.cognitiveMode()),
            readObjects(row.citations()).stream().map(this::frozenCitation).toList(),
            row.contentSha256(),
            row.proposedAt()));
  }

  private KickoffDecision kickoffDecision(WorkflowRows.KickoffDecisionRow row) {
    return new KickoffDecision(
        row.id(),
        new KickoffDecisionDescription(
            row.reference(),
            new Ref<>(row.iterationId()),
            new Ref<>(row.proposalId()),
            row.proposalSha256(),
            IterationWorkflow.KickoffAction.parseStored(row.action()),
            row.reason(),
            new Ref<>(row.decidedByUserId()),
            row.decidedAt(),
            row.contentSha256()));
  }

  private ProblemStatement problemStatement(WorkflowRows.ProblemStatementRow row) {
    return new ProblemStatement(
        row.id(),
        new ProblemStatementDescription(
            new Ref<>(row.iterationId()),
            new Ref<>(row.storyId()),
            row.revisionNumber(),
            row.title(),
            row.problem(),
            InboxWorkflow.CognitiveMode.parseStored(row.cognitiveMode()),
            readObjects(row.citations()).stream().map(this::frozenCitation).toList(),
            row.contentSha256(),
            row.createdAt()));
  }

  private StoryCard storyCard(WorkflowRows.StoryCardRow row) {
    return new StoryCard(
        row.id(),
        new StoryCardDescription(
            new Ref<>(row.iterationId()),
            new Ref<>(row.storyId()),
            row.revisionNumber(),
            row.title(),
            row.role(),
            row.goal(),
            row.value(),
            new Ref<>(row.problemStatementId()),
            row.contentSha256(),
            row.createdAt()));
  }

  private Clarification clarification(WorkflowRows.ClarificationRow row) {
    return new Clarification(
        row.id(),
        new ClarificationDescription(
            row.reference(),
            new Ref<>(row.iterationId()),
            new Ref<>(row.storyId()),
            new Ref<>(row.storyRevisionId()),
            row.sequence(),
            Understanding.ClarificationTarget.parse(row.target()),
            row.question(),
            Understanding.ClarificationStatus.parseStored(row.status()),
            row.askedAt(),
            row.answer(),
            row.answeredByUserId() == null ? null : new Ref<>(row.answeredByUserId()),
            row.answeredAt(),
            row.waivedReason(),
            row.waivedByUserId() == null ? null : new Ref<>(row.waivedByUserId()),
            row.waivedAt(),
            row.contentSha256()));
  }

  private ScenarioProposal scenarioProposal(WorkflowRows.ScenarioProposalRow row) {
    return new ScenarioProposal(
        row.id(),
        new ScenarioProposalDescription(
            row.reference(),
            new Ref<>(row.iterationId()),
            new Ref<>(row.storyId()),
            new Ref<>(row.storyRevisionId()),
            row.sequence(),
            mapper.findScenarioDrafts(row.id()).stream().map(this::scenarioDraft).toList(),
            row.proposedAt(),
            row.contentSha256()));
  }

  private ScenarioDraft scenarioDraft(WorkflowRows.ScenarioDraftRow row) {
    return new ScenarioDraft(
        row.id(),
        new ScenarioDraftDescription(
            row.reference(),
            row.position(),
            new Ref<>(row.proposalId()),
            row.title(),
            readStrings(row.givenSteps()),
            row.whenStep(),
            readStrings(row.thenSteps()),
            readStrings(row.businessData()),
            row.contentSha256()));
  }

  private UnderstandingDecision understandingDecision(WorkflowRows.UnderstandingDecisionRow row) {
    return new UnderstandingDecision(
        row.id(),
        new UnderstandingDecisionDescription(
            row.reference(),
            new Ref<>(row.iterationId()),
            new Ref<>(row.storyId()),
            new Ref<>(row.storyRevisionId()),
            row.proposalId() == null ? null : new Ref<>(row.proposalId()),
            row.proposalSha256(),
            Understanding.DecisionAction.parseStored(row.action()),
            row.reason(),
            readStrings(row.selectedDraftIds()).stream().map(Ref::new).toList(),
            readStrings(row.confirmedScenarioIds()).stream().map(Ref::new).toList(),
            new Ref<>(row.decidedByUserId()),
            row.decidedAt(),
            row.contentSha256()));
  }

  private NoModelImpact noModelImpact(WorkflowRows.NoModelImpactRow row) {
    return new NoModelImpact(
        row.id(),
        new NoModelImpactDescription(
            row.reference(),
            new Ref<>(row.iterationId()),
            new Ref<>(row.storyId()),
            new Ref<>(row.storyRevisionId()),
            row.storyRevisionSha256(),
            row.reason(),
            new Ref<>(row.decidedByUserId()),
            row.decidedAt(),
            row.contentSha256()));
  }

  private TaskingPlanCandidate taskingCandidate(WorkflowRows.TaskingCandidateRow row) {
    StoredTaskingPayload payload = read(row.payload(), StoredTaskingPayload.class);
    return new TaskingPlanCandidate(
        row.id(),
        candidateDescription(
            row.reference(),
            row.iterationId(),
            row.storyId(),
            row.storyRevisionId(),
            row.storyRevisionSha256(),
            row.baseCommitSha(),
            row.noModelImpactDecisionId(),
            row.noModelImpactDecisionSha256(),
            row.sequence(),
            row.projectCatalogSha256(),
            payload,
            row.contentSha256(),
            row.proposedAt()));
  }

  private DeskCheckDecision deskDecision(WorkflowRows.DeskCheckDecisionRow row) {
    return new DeskCheckDecision(
        row.id(),
        new DeskCheckDecisionDescription(
            row.reference(),
            new Ref<>(row.iterationId()),
            new Ref<>(row.candidateId()),
            row.candidateSha256(),
            Tasking.DeskCheckAction.parseStored(row.action()),
            row.reason(),
            new Ref<>(row.decidedByUserId()),
            row.decidedAt(),
            row.contentSha256()));
  }

  private ApprovedTaskingPlan approvedPlan(WorkflowRows.ApprovedPlanRow row) {
    StoredApprovedPayload payload = read(row.payload(), StoredApprovedPayload.class);
    StoredTaskingPayload planPayload =
        new StoredTaskingPayload(
            payload.planVersion(),
            payload.projectCatalog(),
            payload.tests(),
            payload.tasks(),
            payload.processes(),
            payload.executionBudget());
    TaskingPlanCandidateDescription plan =
        candidateDescription(
            payload.reference(),
            row.iterationId(),
            row.storyId(),
            row.storyRevisionId(),
            payload.storyRevisionSha256(),
            payload.baseCommitSha(),
            payload.noModelImpactDecisionId(),
            payload.noModelImpactDecisionSha256(),
            payload.sequence(),
            payload.projectCatalogSha256(),
            planPayload,
            payload.candidateContentSha256(),
            Instant.parse(payload.proposedAt()));
    return new ApprovedTaskingPlan(
        row.id(),
        new ApprovedTaskingPlanDescription(
            new Ref<>(row.iterationId()),
            new Ref<>(row.storyId()),
            new Ref<>(row.storyRevisionId()),
            new Ref<>(row.taskingCandidateId()),
            new Ref<>(row.deskCheckDecisionId()),
            plan,
            row.contentSha256(),
            new Ref<>(row.approvedByUserId()),
            row.approvedAt()));
  }

  private TaskingPlanCandidateDescription candidateDescription(
      String reference,
      String iterationId,
      String storyId,
      String revisionId,
      String revisionSha,
      String baseCommitSha,
      String noModelId,
      String noModelSha,
      int sequence,
      String projectHash,
      StoredTaskingPayload payload,
      String contentHash,
      Instant proposedAt) {
    return new TaskingPlanCandidateDescription(
        payload.planVersion(),
        reference,
        new Ref<>(iterationId),
        new Ref<>(storyId),
        new Ref<>(revisionId),
        revisionSha,
        baseCommitSha,
        new Ref<>(noModelId),
        noModelSha,
        sequence,
        payload.projectCatalog(),
        projectHash,
        payload.tests(),
        payload.tasks(),
        payload.processes(),
        payload.executionBudget(),
        contentHash,
        proposedAt);
  }

  private Story requireStory(String storyId) {
    return Optional.ofNullable(mapper.findStory(workspaceId, storyId))
        .map(row -> StoryEntities.story(row, new StoryRevisions(row.id(), mapper, objectMapper)))
        .orElseThrow(() -> DomainException.notFound("Story " + storyId + " not found"));
  }

  private StoryRevision requireStoryRevision(String storyId, String revisionId) {
    return requireStory(storyId)
        .revisions()
        .findByIdentity(revisionId)
        .orElseThrow(() -> DomainException.notFound("Story Revision " + revisionId + " not found"));
  }

  private WorkflowRows.IntakeRow requireIntakeRow(String iterationId) {
    WorkflowRows.IntakeRow row = mapper.findIntake(iterationId);
    if (row == null) throw DomainException.internal("Iteration " + iterationId + " lost Intake");
    return row;
  }

  private WorkflowRows.ProblemStatementRow requireProblem(String id) {
    WorkflowRows.ProblemStatementRow row = mapper.findProblemStatement(id);
    if (row == null)
      throw DomainException.internal("Problem Statement " + id + " was not persisted");
    return row;
  }

  private WorkflowRows.StoryCardRow requireCard(String id) {
    WorkflowRows.StoryCardRow row = mapper.findStoryCard(id);
    if (row == null) throw DomainException.internal("Story Card " + id + " was not persisted");
    return row;
  }

  private Iteration requireIteration(String iterationId) {
    return findIteration(iterationId)
        .orElseThrow(() -> DomainException.notFound("Iteration " + iterationId + " not found"));
  }

  private InboxRows.IterationRow requireIterationRow(String iterationId) {
    InboxRows.IterationRow row = mapper.findIteration(workspaceId, iterationId);
    if (row == null) throw DomainException.notFound("Iteration " + iterationId + " not found");
    return row;
  }

  private InboxRows.IterationRow lockIteration(String iterationId) {
    InboxRows.IterationRow row = mapper.lockIteration(workspaceId, iterationId);
    if (row == null) throw DomainException.notFound("Iteration " + iterationId + " not found");
    return row;
  }

  private void requireState(
      InboxRows.IterationRow iteration, String loop, String stage, String activity) {
    if (!"active".equals(iteration.lifecycle())
        || !loop.equals(iteration.loop())
        || !stage.equals(iteration.stage())) {
      throw DomainException.conflict("Iteration " + iteration.id() + " is not " + activity);
    }
  }

  private void claim(
      String iterationId,
      int expectedVersion,
      String loop,
      List<String> stages,
      String lifecycle,
      String newLoop,
      String stage,
      Instant timestamp) {
    if (mapper.claimIteration(
            workspaceId,
            iterationId,
            expectedVersion,
            loop,
            stages,
            lifecycle,
            newLoop,
            stage,
            timestamp)
        != 1) {
      changed(iterationId);
    }
  }

  private Map<String, Object> scenarioMap(Understanding.ScenarioInput scenario) {
    return map(
        "title", scenario.title(),
        "given", scenario.given(),
        "when", scenario.when(),
        "then", scenario.then(),
        "businessData", scenario.businessData());
  }

  private Map<String, Object> processMap(Tasking.ProcessSelection process, boolean includeHash) {
    Map<String, Object> value =
        map(
            "runtimePlanId", process.runtimePlanId(),
            "processId", process.processId(),
            "processVersion", process.processVersion(),
            "definitionSha256", process.definitionSha256(),
            "functionalContexts", process.functionalContexts(),
            "technicalBoundaries", process.technicalBoundaries(),
            "selectedStepIds", process.selectedStepIds(),
            "projectIds", process.projectIds(),
            "projectCatalogSha256", process.projectCatalogSha256(),
            "focusedCommands", jsonValue(process.focusedCommands()),
            "qualityGates", jsonValue(process.qualityGates()));
    if (includeHash) value.put("materializedSha256", process.materializedSha256());
    return value;
  }

  private Object jsonValue(Object value) {
    return objectMapper.convertValue(value, Object.class);
  }

  private <T> T read(String json, Class<T> type) {
    try {
      return objectMapper.readValue(json, type);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Persisted workflow JSON could not be read");
    }
  }

  private Map<String, Object> readObject(String json) {
    try {
      return objectMapper.readValue(json, OBJECT);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Persisted workflow object could not be read");
    }
  }

  private List<Map<String, Object>> readObjects(String json) {
    try {
      return objectMapper.readValue(json, OBJECTS);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Persisted workflow list could not be read");
    }
  }

  private List<String> readStrings(String json) {
    try {
      return objectMapper.readValue(json, STRINGS);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Persisted workflow strings could not be read");
    }
  }

  private String write(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Workflow JSON could not be written");
    }
  }

  private static Map<String, Object> map(Object... values) {
    LinkedHashMap<String, Object> result = new LinkedHashMap<>();
    for (int index = 0; index < values.length; index += 2) {
      result.put((String) values[index], values[index + 1]);
    }
    return result;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> object(Map<String, Object> value, String name) {
    Object nested = value.get(name);
    if (!(nested instanceof Map<?, ?>)) {
      throw DomainException.internal("Persisted workflow has invalid " + name);
    }
    return (Map<String, Object>) nested;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> objects(Map<String, Object> value, String name) {
    Object nested = value.get(name);
    if (!(nested instanceof List<?>)) {
      throw DomainException.internal("Persisted workflow has invalid " + name);
    }
    return (List<Map<String, Object>>) nested;
  }

  private static String string(Map<String, Object> value, String name) {
    Object nested = value.get(name);
    if (!(nested instanceof String text)) {
      throw DomainException.internal("Persisted workflow has invalid " + name);
    }
    return text;
  }

  private static int integer(Map<String, Object> value, String name) {
    Object nested = value.get(name);
    if (!(nested instanceof Number number)) {
      throw DomainException.internal("Persisted workflow has invalid " + name);
    }
    return number.intValue();
  }

  private static String optionalString(Object value) {
    return value == null ? null : value.toString();
  }

  private static Instant optionalInstant(Object value) {
    return value == null ? null : Instant.parse(value.toString());
  }

  private static void validatePage(int page, int pageSize) {
    if (page <= 0 || pageSize <= 0 || pageSize > 100) {
      throw DomainException.validation("page and pageSize must be greater than 0");
    }
  }

  private String reference(String prefix, IntSupplier sequence, int width) {
    return ("%s-%0" + width + "d").formatted(prefix, sequence.getAsInt());
  }

  private static String localReference(String prefix, int sequence) {
    return "%s-%03d".formatted(prefix, sequence);
  }

  private Instant timestamp() {
    return clock.instant().truncatedTo(ChronoUnit.MILLIS);
  }

  private static void changed(String iterationId) {
    throw DomainException.conflict("Iteration " + iterationId + " has changed");
  }

  private record Context(InboxRows.IterationRow iteration, Story story, StoryRevision revision) {}

  private record DraftValue(
      String id,
      String reference,
      int position,
      Understanding.ScenarioInput scenario,
      String contentSha256) {}

  private record ScenarioValue(String id, String reference, WorkflowRows.ScenarioDraftRow draft) {}

  private record StoredTaskingPayload(
      int planVersion,
      Tasking.ProjectCatalog projectCatalog,
      List<Tasking.TestDescription> tests,
      List<Tasking.TaskDescription> tasks,
      List<Tasking.ProcessSelection> processes,
      Tasking.ExecutionBudget executionBudget) {}

  private record StoredApprovedPayload(
      String reference,
      String storyRevisionSha256,
      String baseCommitSha,
      String noModelImpactDecisionId,
      String noModelImpactDecisionSha256,
      int sequence,
      String projectCatalogSha256,
      int planVersion,
      Tasking.ProjectCatalog projectCatalog,
      List<Tasking.TestDescription> tests,
      List<Tasking.TaskDescription> tasks,
      List<Tasking.ProcessSelection> processes,
      Tasking.ExecutionBudget executionBudget,
      String candidateContentSha256,
      String proposedAt) {}
}
