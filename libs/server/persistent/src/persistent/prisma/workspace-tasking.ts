import { randomUUID } from 'node:crypto';
import {
  ApprovedTaskingPlan,
  DeskCheckDecision,
  DomainError,
  NoModelImpactDecision,
  Ref,
  TASKING_PROCESS_CATALOG,
  TaskingCandidate,
  normalizeDecideTaskingInput,
  normalizeProposeTaskingInput,
  normalizeRecordNoModelImpactInput,
  type DecideTaskingInput,
  type DeskCheckAction,
  type DeskCheckDecisionResult,
  type JsonValue,
  type ProposeTaskingInput,
  type RecordNoModelImpactInput,
  type TaskingCandidateDescription,
  type TaskingProcessSelection,
  type TaskingProjectCatalogInput,
  type TaskingTaskDescription,
  type TaskingTestDescription,
  type TaskingView,
  type WorkspaceTasking,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { hashCanonicalJson } from '../workflow-content';
import type { PrismaStore } from './types';
import { inputJson, now } from './utils';
import {
  assembleStory,
  assembleStoryRevision,
  STORY_INCLUDE,
  STORY_REVISION_INCLUDE,
} from './workspace-delivery';
import {
  assembleIteration,
  iterationInclude,
} from './workspace-iterations';

const ITERATION_INCLUDE = iterationInclude();

type NoModelImpactRow = Prisma.NoModelImpactDecisionGetPayload<
  Record<string, never>
>;
type CandidateRow = Prisma.TaskingCandidateGetPayload<Record<string, never>>;
type DecisionRow = Prisma.DeskCheckDecisionGetPayload<Record<string, never>>;
type ApprovedPlanRow = Prisma.ApprovedTaskingPlanGetPayload<
  Record<string, never>
>;

interface StoredTaskingPayload {
  projectCatalog: TaskingProjectCatalogInput;
  tests: TaskingTestDescription[];
  tasks: TaskingTaskDescription[];
  processes: TaskingProcessSelection[];
}

interface StoredApprovedPlan extends StoredTaskingPayload {
  reference: string;
  storyRevisionSha256: string;
  baseCommitSha: string;
  noModelImpactDecisionId: string;
  noModelImpactDecisionSha256: string;
  sequence: number;
  projectCatalogSha256: string;
  candidateContentSha256: string;
  proposedAt: string;
}

export class PrismaWorkspaceTasking implements WorkspaceTasking {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async findTasking(iterationId: string): Promise<TaskingView | null> {
    const context = await findContext(this.store, this.workspaceId, iterationId);
    if (!context) return null;
    const [noModelImpact, candidate, decisions, approvedPlan] =
      await Promise.all([
        this.store.noModelImpactDecision.findFirst({
          where: {
            iterationId,
            workspaceId: this.workspaceId,
            storyRevisionId: context.revision.id,
          },
          orderBy: { decidedAt: 'desc' },
        }),
        this.store.taskingCandidate.findFirst({
          where: {
            iterationId,
            workspaceId: this.workspaceId,
            decision: null,
          },
          orderBy: { sequence: 'desc' },
        }),
        this.store.deskCheckDecision.findMany({
          where: { iterationId, workspaceId: this.workspaceId },
          orderBy: { decidedAt: 'asc' },
        }),
        this.store.approvedTaskingPlan.findUnique({
          where: { iterationId },
        }),
      ]);
    return {
      iteration: assembleIteration(context.iteration),
      story: assembleStory(context.story),
      storyRevision: assembleStoryRevision(context.revision),
      noModelImpactDecision: noModelImpact
        ? assembleNoModelImpact(noModelImpact)
        : null,
      currentCandidate: candidate ? assembleCandidate(candidate) : null,
      decisions: decisions.map(assembleDecision),
      approvedPlan: approvedPlan ? assembleApprovedPlan(approvedPlan) : null,
      processCatalog: TASKING_PROCESS_CATALOG,
    };
  }

  async recordNoModelImpact(
    iterationId: string,
    rawInput: RecordNoModelImpactInput,
    decidedByUserId: string,
  ): Promise<NoModelImpactDecision> {
    const input = normalizeRecordNoModelImpactInput(rawInput);
    return this.transaction(async (store) => {
      const context = await requireContext(
        store,
        this.workspaceId,
        iterationId,
      );
      const existing = await store.noModelImpactDecision.findFirst({
        where: { storyRevisionId: input.storyRevisionId },
      });
      if (existing) {
        if (
          existing.iterationId === iterationId &&
          existing.storyId === input.storyId &&
          existing.storyRevisionSha256 === input.storyRevisionSha256 &&
          existing.reason === input.reason &&
          existing.decidedByUserId === decidedByUserId
        ) {
          return assembleNoModelImpact(existing);
        }
        throw DomainError.conflict(
          `Story Revision ${input.storyRevisionId} already has a No Model Impact Decision`,
        );
      }
      requireModelingContext(context, input);
      const decidedAt = now();
      await claimIteration(
        store,
        this.workspaceId,
        iterationId,
        input.expectedIterationVersion,
        'understand',
        ['modeling'],
        { loop: 'tasking', stage: 'drafting' },
        decidedAt,
      );
      const sequence =
        (await store.noModelImpactDecision.count({ where: { iterationId } })) +
        1;
      const id = randomUUID();
      const reference = formatReference('NMI', sequence);
      const contentSha256 = hashCanonicalJson({
        iterationId,
        storyId: context.story.id,
        storyRevisionId: context.revision.id,
        storyRevisionSha256: context.revision.contentSha256,
        subject: 'tool',
        method: 'none',
        modelChangeRequired: false,
        reason: input.reason,
        decidedByUserId,
        decidedAt: decidedAt.toISOString(),
      });
      const row = await store.noModelImpactDecision.create({
        data: {
          id,
          reference,
          workspaceId: this.workspaceId,
          iterationId,
          storyId: context.story.id,
          storyRevisionId: context.revision.id,
          storyRevisionSha256: context.revision.contentSha256,
          reason: input.reason,
          decidedByUserId,
          decidedAt,
          contentSha256,
        },
      });
      return assembleNoModelImpact(row);
    });
  }

  async proposeTasking(
    iterationId: string,
    rawInput: ProposeTaskingInput,
  ): Promise<TaskingCandidate> {
    return this.transaction(async (store) => {
      const context = await requireContext(
        store,
        this.workspaceId,
        iterationId,
      );
      const noModelImpact = await store.noModelImpactDecision.findFirst({
        where: {
          iterationId,
          workspaceId: this.workspaceId,
          storyRevisionId: context.revision.id,
        },
      });
      if (!noModelImpact) {
        throw DomainError.conflict(
          'Tasking requires an immutable No Model Impact Decision',
        );
      }
      const draft = normalizeProposeTaskingInput(
        rawInput,
        context.revision.scenarios.map((scenario) => ({
          id: scenario.reference,
          title: scenario.title,
          given: jsonStrings(scenario.givenSteps, scenario.id, 'Given'),
          when: scenario.whenStep,
          then: jsonStrings(scenario.thenSteps, scenario.id, 'Then'),
          businessData: jsonStrings(
            scenario.businessData,
            scenario.id,
            'businessData',
          ),
        })),
      );
      requireDraftingContext(context, draft.input, noModelImpact);
      const proposedAt = now();
      await claimIteration(
        store,
        this.workspaceId,
        iterationId,
        draft.input.expectedIterationVersion,
        'tasking',
        ['drafting', 'knowledge_gap'],
        { stage: 'desk_check' },
        proposedAt,
      );
      const sequence =
        (await store.taskingCandidate.count({ where: { iterationId } })) + 1;
      const id = randomUUID();
      const reference = formatReference('TASKING', sequence);
      const projectCatalogSha256 = hashCanonicalJson(
        draft.projectCatalog as unknown as JsonValue,
      );
      const processes = draft.runtimes.map((runtime) => {
        const selection = {
          runtimePlanId: runtime.input.id,
          processId: runtime.process.id,
          processVersion: runtime.process.version,
          definitionSha256: hashCanonicalJson(
            runtime.process as unknown as JsonValue,
          ),
          functionalContexts: runtime.input.functionalContexts,
          technicalBoundaries: runtime.input.technicalBoundaries,
          selectedStepIds: runtime.selectedStepIds,
          projectIds: runtime.input.projectIds,
          projectCatalogSha256,
          focusedCommands: runtime.focusedCommands,
          qualityGates: runtime.qualityGates,
        } satisfies Omit<TaskingProcessSelection, 'materializedSha256'>;
        return {
          ...selection,
          materializedSha256: hashCanonicalJson(
            selection as unknown as JsonValue,
          ),
        };
      });
      const payload: StoredTaskingPayload = {
        projectCatalog: draft.projectCatalog,
        tests: draft.tests,
        tasks: draft.tasks,
        processes,
      };
      const candidateContent = {
        reference,
        iterationId,
        storyId: context.story.id,
        storyRevisionId: context.revision.id,
        storyRevisionSha256: context.revision.contentSha256,
        baseCommitSha: context.iteration.baseCommitSha,
        noModelImpactDecisionId: noModelImpact.id,
        noModelImpactDecisionSha256: noModelImpact.contentSha256,
        sequence,
        ...payload,
        projectCatalogSha256,
        proposedBy: 'tasking-analyst',
        proposedAt: proposedAt.toISOString(),
      };
      const contentSha256 = hashCanonicalJson(
        candidateContent as unknown as JsonValue,
      );
      const row = await store.taskingCandidate.create({
        data: {
          id,
          reference,
          workspaceId: this.workspaceId,
          iterationId,
          storyId: context.story.id,
          storyRevisionId: context.revision.id,
          storyRevisionSha256: context.revision.contentSha256,
          baseCommitSha: context.iteration.baseCommitSha,
          noModelImpactDecisionId: noModelImpact.id,
          noModelImpactDecisionSha256: noModelImpact.contentSha256,
          sequence,
          projectCatalogSha256,
          payload: inputJson(payload),
          contentSha256,
          proposedAt,
        },
      });
      return assembleCandidate(row);
    });
  }

  async decideTasking(
    iterationId: string,
    rawInput: DecideTaskingInput,
    decidedByUserId: string,
  ): Promise<DeskCheckDecisionResult> {
    const input = normalizeDecideTaskingInput(rawInput);
    return this.transaction(async (store) => {
      const context = await requireContext(
        store,
        this.workspaceId,
        iterationId,
      );
      requireDeskCheckContext(context);
      const candidate = await store.taskingCandidate.findFirst({
        where: {
          id: input.candidateId,
          iterationId,
          workspaceId: this.workspaceId,
          decision: null,
        },
      });
      if (!candidate) {
        throw DomainError.notFound(
          `Tasking Candidate ${input.candidateId} not found`,
        );
      }
      if (candidate.contentSha256 !== input.candidateSha256) {
        throw DomainError.conflict(
          `Tasking Candidate ${input.candidateId} content has changed`,
        );
      }
      if (
        candidate.storyRevisionId !== context.revision.id ||
        candidate.storyRevisionSha256 !== context.revision.contentSha256 ||
        candidate.baseCommitSha !== context.iteration.baseCommitSha
      ) {
        throw DomainError.conflict(
          'Tasking Candidate authority no longer matches the Iteration',
        );
      }
      const noModelImpact = await store.noModelImpactDecision.findFirst({
        where: { id: candidate.noModelImpactDecisionId },
      });
      if (
        !noModelImpact ||
        noModelImpact.contentSha256 !== candidate.noModelImpactDecisionSha256
      ) {
        throw DomainError.conflict(
          'Tasking Candidate No Model Impact authority has changed',
        );
      }
      revalidateCandidate(candidate, context.revision.scenarios);
      const decidedAt = now();
      const next = nextStage(input.action);
      await claimIteration(
        store,
        this.workspaceId,
        iterationId,
        input.expectedIterationVersion,
        'tasking',
        ['desk_check'],
        next,
        decidedAt,
      );
      const sequence =
        (await store.deskCheckDecision.count({ where: { iterationId } })) + 1;
      const decisionId = randomUUID();
      const decisionReference = formatReference('DC', sequence);
      const decisionSha256 = hashCanonicalJson({
        iterationId,
        candidateId: candidate.id,
        candidateSha256: candidate.contentSha256,
        action: input.action,
        reason: input.reason ?? null,
        decidedByUserId,
        decidedAt: decidedAt.toISOString(),
      });
      const decisionRow = await store.deskCheckDecision.create({
        data: {
          id: decisionId,
          reference: decisionReference,
          workspaceId: this.workspaceId,
          iterationId,
          candidateId: candidate.id,
          candidateSha256: candidate.contentSha256,
          action: input.action,
          reason: input.reason ?? null,
          decidedByUserId,
          decidedAt,
          contentSha256: decisionSha256,
        },
      });
      let approvedPlan: ApprovedTaskingPlan | null = null;
      if (input.action === 'approve') {
        const payload = approvedSnapshot(candidate);
        const planSha256 = hashCanonicalJson({
          iterationId,
          storyId: candidate.storyId,
          storyRevisionId: candidate.storyRevisionId,
          taskingCandidateId: candidate.id,
          taskingCandidateSha256: candidate.contentSha256,
          deskCheckDecisionId: decisionId,
          deskCheckDecisionSha256: decisionSha256,
          plan: payload as unknown as JsonValue,
          approvedByUserId: decidedByUserId,
          approvedAt: decidedAt.toISOString(),
        });
        const planRow = await store.approvedTaskingPlan.create({
          data: {
            id: randomUUID(),
            workspaceId: this.workspaceId,
            iterationId,
            storyId: candidate.storyId,
            storyRevisionId: candidate.storyRevisionId,
            taskingCandidateId: candidate.id,
            deskCheckDecisionId: decisionId,
            payload: inputJson(payload),
            contentSha256: planSha256,
            approvedByUserId: decidedByUserId,
            approvedAt: decidedAt,
          },
        });
        approvedPlan = assembleApprovedPlan(planRow);
      }
      const iteration = await requireIteration(
        store,
        this.workspaceId,
        iterationId,
      );
      return {
        iteration: assembleIteration(iteration),
        decision: assembleDecision(decisionRow),
        approvedPlan,
      };
    });
  }

  private async transaction<T>(
    operation: (store: PrismaStore) => Promise<T>,
  ): Promise<T> {
    if ('$transaction' in this.store) {
      return this.store.$transaction((transaction) => operation(transaction));
    }
    return operation(this.store);
  }
}

async function findContext(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
) {
  const iteration = await store.iteration.findFirst({
    where: { id: iterationId, workspaceId },
    include: ITERATION_INCLUDE,
  });
  if (!iteration?.story) return null;
  const story = await store.story.findFirst({
    where: { id: iteration.story.id, workspaceId },
    include: STORY_INCLUDE,
  });
  if (!story?.latestRevisionId) return null;
  const revision = await store.storyRevision.findUnique({
    where: { id: story.latestRevisionId },
    include: STORY_REVISION_INCLUDE,
  });
  return revision ? { iteration, story, revision } : null;
}

async function requireContext(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
) {
  const context = await findContext(store, workspaceId, iterationId);
  if (!context) throw DomainError.notFound(`Tasking ${iterationId} not found`);
  return context;
}

async function requireIteration(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
) {
  const iteration = await store.iteration.findFirst({
    where: { id: iterationId, workspaceId },
    include: ITERATION_INCLUDE,
  });
  if (!iteration)
    throw DomainError.notFound(`Iteration ${iterationId} not found`);
  return iteration;
}

function requireModelingContext(
  context: NonNullable<Awaited<ReturnType<typeof findContext>>>,
  input: RecordNoModelImpactInput,
) {
  if (
    context.iteration.lifecycle !== 'active' ||
    context.iteration.loop !== 'understand' ||
    context.iteration.stage !== 'modeling'
  ) {
    throw DomainError.conflict(
      `Iteration ${context.iteration.id} is not in Understand/Modeling`,
    );
  }
  if (
    context.story.id !== input.storyId ||
    context.revision.id !== input.storyRevisionId ||
    context.revision.contentSha256 !== input.storyRevisionSha256
  ) {
    throw DomainError.conflict('The active Story Revision has changed');
  }
  if (context.revision.scenarios.length === 0) {
    throw DomainError.conflict(
      'No Model Impact requires a confirmed Story Scenario Set',
    );
  }
}

function requireDraftingContext(
  context: NonNullable<Awaited<ReturnType<typeof findContext>>>,
  input: ProposeTaskingInput,
  noModelImpact: NoModelImpactRow,
) {
  if (
    context.iteration.lifecycle !== 'active' ||
    context.iteration.loop !== 'tasking' ||
    !['drafting', 'knowledge_gap'].includes(context.iteration.stage)
  ) {
    throw DomainError.conflict(
      `Iteration ${context.iteration.id} is not in Tasking/Drafting`,
    );
  }
  if (
    context.story.id !== input.storyId ||
    context.revision.id !== input.storyRevisionId ||
    noModelImpact.id !== input.noModelImpactDecisionId ||
    noModelImpact.contentSha256 !== input.noModelImpactDecisionSha256
  ) {
    throw DomainError.conflict('Tasking authority has changed');
  }
}

function requireDeskCheckContext(
  context: NonNullable<Awaited<ReturnType<typeof findContext>>>,
) {
  if (
    context.iteration.lifecycle !== 'active' ||
    context.iteration.loop !== 'tasking' ||
    context.iteration.stage !== 'desk_check'
  ) {
    throw DomainError.conflict(
      `Iteration ${context.iteration.id} is not in Tasking/Desk Check`,
    );
  }
}

async function claimIteration(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  expectedVersion: number,
  loop: string,
  stages: string[],
  data: Prisma.IterationUpdateManyMutationInput,
  timestamp: Date,
) {
  const claimed = await store.iteration.updateMany({
    where: {
      id: iterationId,
      workspaceId,
      lifecycle: 'active',
      loop,
      stage: { in: stages },
      version: expectedVersion,
    },
    data: { ...data, version: { increment: 1 }, updatedAt: timestamp },
  });
  if (claimed.count !== 1) {
    throw DomainError.conflict(
      `Iteration ${iterationId} changed; reload before deciding`,
    );
  }
}

function revalidateCandidate(
  candidate: CandidateRow,
  scenarios: Array<{
    id: string;
    reference: string;
    title: string;
    givenSteps: Prisma.JsonValue;
    whenStep: string;
    thenSteps: Prisma.JsonValue;
    businessData: Prisma.JsonValue;
  }>,
) {
  const payload = taskingPayload(candidate.payload, candidate.id);
  normalizeProposeTaskingInput(
    {
      expectedIterationVersion: 1,
      storyId: candidate.storyId,
      storyRevisionId: candidate.storyRevisionId,
      noModelImpactDecisionId: candidate.noModelImpactDecisionId,
      noModelImpactDecisionSha256: candidate.noModelImpactDecisionSha256,
      projectCatalog: payload.projectCatalog,
      runtimes: payload.processes.map((process) => ({
        id: process.runtimePlanId,
        runtime: 'typescript',
        functionalContexts: process.functionalContexts,
        technicalBoundaries: process.technicalBoundaries,
        projectIds: process.projectIds,
      })),
      tests: payload.tests,
      tasks: payload.tasks,
    },
    scenarios.map((scenario) => ({
      id: scenario.reference,
      title: scenario.title,
      given: jsonStrings(scenario.givenSteps, scenario.id, 'Given'),
      when: scenario.whenStep,
      then: jsonStrings(scenario.thenSteps, scenario.id, 'Then'),
      businessData: jsonStrings(
        scenario.businessData,
        scenario.id,
        'businessData',
      ),
    })),
  );
  const projectCatalogSha256 = hashCanonicalJson(
    payload.projectCatalog as unknown as JsonValue,
  );
  if (projectCatalogSha256 !== candidate.projectCatalogSha256) {
    throw DomainError.conflict('Tasking Nx project catalog hash has changed');
  }
  for (const selection of payload.processes) {
    const definition = TASKING_PROCESS_CATALOG.find(
      ({ id }) => id === selection.processId,
    );
    if (
      !definition ||
      hashCanonicalJson(definition as unknown as JsonValue) !==
        selection.definitionSha256
    ) {
      throw DomainError.conflict(
        `Tasking process ${selection.processId} definition has changed`,
      );
    }
    const { materializedSha256: ignored, ...materialized } = selection;
    void ignored;
    if (
      hashCanonicalJson(materialized as unknown as JsonValue) !==
      selection.materializedSha256
    ) {
      throw DomainError.conflict(
        `Tasking process ${selection.processId} materialization has changed`,
      );
    }
  }
}

function nextStage(
  action: DeskCheckAction,
): Prisma.IterationUpdateManyMutationInput {
  switch (action) {
    case 'approve':
      return { stage: 'approved' };
    case 'revise':
      return { stage: 'drafting' };
    case 'architecture_gap':
    case 'process_gap':
      return { stage: 'knowledge_gap' };
    case 'scenario_gap':
      return { loop: 'understand', stage: 'tqa' };
  }
}

function approvedSnapshot(candidate: CandidateRow): StoredApprovedPlan {
  const payload = taskingPayload(candidate.payload, candidate.id);
  return {
    reference: candidate.reference,
    storyRevisionSha256: candidate.storyRevisionSha256,
    baseCommitSha: candidate.baseCommitSha,
    noModelImpactDecisionId: candidate.noModelImpactDecisionId,
    noModelImpactDecisionSha256: candidate.noModelImpactDecisionSha256,
    sequence: candidate.sequence,
    projectCatalogSha256: candidate.projectCatalogSha256,
    ...payload,
    candidateContentSha256: candidate.contentSha256,
    proposedAt: candidate.proposedAt.toISOString(),
  };
}

function assembleNoModelImpact(
  row: NoModelImpactRow,
): NoModelImpactDecision {
  return new NoModelImpactDecision(row.id, {
    reference: row.reference,
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    storyRevisionSha256: row.storyRevisionSha256,
    subject: 'tool',
    method: 'none',
    modelChangeRequired: false,
    reason: row.reason,
    decidedBy: new Ref(row.decidedByUserId),
    decidedAt: row.decidedAt.toISOString(),
    contentSha256: row.contentSha256,
  });
}

function assembleCandidate(row: CandidateRow): TaskingCandidate {
  const payload = taskingPayload(row.payload, row.id);
  return new TaskingCandidate(row.id, {
    reference: row.reference,
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    storyRevisionSha256: row.storyRevisionSha256,
    baseCommitSha: row.baseCommitSha,
    noModelImpactDecision: new Ref(row.noModelImpactDecisionId),
    noModelImpactDecisionSha256: row.noModelImpactDecisionSha256,
    sequence: row.sequence,
    ...payload,
    projectCatalogSha256: row.projectCatalogSha256,
    contentSha256: row.contentSha256,
    proposedBy: 'tasking-analyst',
    proposedAt: row.proposedAt.toISOString(),
  });
}

function assembleDecision(row: DecisionRow): DeskCheckDecision {
  return new DeskCheckDecision(row.id, {
    reference: row.reference,
    iteration: new Ref(row.iterationId),
    candidate: new Ref(row.candidateId),
    candidateSha256: row.candidateSha256,
    action: row.action as DeskCheckAction,
    reason: row.reason,
    decidedBy: new Ref(row.decidedByUserId),
    decidedAt: row.decidedAt.toISOString(),
    contentSha256: row.contentSha256,
  });
}

function assembleApprovedPlan(row: ApprovedPlanRow): ApprovedTaskingPlan {
  const payload = approvedPayload(row.payload, row.id);
  const plan: TaskingCandidateDescription = {
    reference: payload.reference,
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    storyRevisionSha256: payload.storyRevisionSha256,
    baseCommitSha: payload.baseCommitSha,
    noModelImpactDecision: new Ref(payload.noModelImpactDecisionId),
    noModelImpactDecisionSha256: payload.noModelImpactDecisionSha256,
    sequence: payload.sequence,
    projectCatalog: payload.projectCatalog,
    projectCatalogSha256: payload.projectCatalogSha256,
    tests: payload.tests,
    tasks: payload.tasks,
    processes: payload.processes,
    contentSha256: payload.candidateContentSha256,
    proposedBy: 'tasking-analyst',
    proposedAt: payload.proposedAt,
  };
  return new ApprovedTaskingPlan(row.id, {
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    taskingCandidate: new Ref(row.taskingCandidateId),
    deskCheckDecision: new Ref(row.deskCheckDecisionId),
    plan,
    contentSha256: row.contentSha256,
    approvedBy: new Ref(row.approvedByUserId),
    approvedAt: row.approvedAt.toISOString(),
  });
}

function taskingPayload(
  value: Prisma.JsonValue,
  id: string,
): StoredTaskingPayload {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw DomainError.internal(`Tasking Candidate ${id} has invalid payload`);
  }
  return value as unknown as StoredTaskingPayload;
}

function approvedPayload(
  value: Prisma.JsonValue,
  id: string,
): StoredApprovedPlan {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw DomainError.internal(`Approved Tasking Plan ${id} has invalid payload`);
  }
  return value as unknown as StoredApprovedPlan;
}

function jsonStrings(
  value: Prisma.JsonValue,
  id: string,
  field: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw DomainError.internal(`${id} has invalid ${field}`);
  }
  return value as string[];
}

function formatReference(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}
