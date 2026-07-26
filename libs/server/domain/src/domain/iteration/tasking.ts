import { Entity, Ref } from '../core';
import type { Story, StoryRevision } from '../delivery';
import type { Iteration } from './iteration';
import type {
  TaskingFunctionalContext,
  TaskingProcessDefinition,
  TaskingTechnicalBoundary,
} from './tasking-catalog';

export interface NoModelImpactDecisionDescription {
  reference: string;
  iteration: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  storyRevisionSha256: string;
  subject: 'tool';
  method: 'none';
  modelChangeRequired: false;
  reason: string;
  decidedBy: Ref<string>;
  decidedAt: string;
  contentSha256: string;
}

export class NoModelImpactDecision
  implements Entity<string, NoModelImpactDecisionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: NoModelImpactDecisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): NoModelImpactDecisionDescription {
    return this.desc;
  }
}

export interface TaskingProjectInput {
  id: string;
  root: string;
  targets: string[];
}

export interface TaskingProjectCatalogInput {
  projects: TaskingProjectInput[];
}

export interface TaskingRuntimeInput {
  id: string;
  runtime: 'typescript';
  functionalContexts: TaskingFunctionalContext[];
  technicalBoundaries: TaskingTechnicalBoundary[];
  projectIds: string[];
}

export interface TaskingTestInput {
  id: string;
  quadrant: 'Q1' | 'Q2';
  intent: string;
  runtimePlanId: string;
  stepId: string;
  projectId?: string | null;
  testFilter: string;
  supportedBy: string[];
  scenarioIds: string[];
  scenarioOutcome?: string | null;
  businessData: string[];
  modelRefs: { entities: string[]; associations: string[] };
}

export interface TaskingTaskInput {
  id: string;
  description: string;
  testIds: string[];
  dependsOn: string[];
}

export interface ProposeTaskingInput {
  expectedIterationVersion: number;
  storyId: string;
  storyRevisionId: string;
  noModelImpactDecisionId: string;
  noModelImpactDecisionSha256: string;
  projectCatalog: TaskingProjectCatalogInput;
  runtimes: TaskingRuntimeInput[];
  tests: TaskingTestInput[];
  tasks: TaskingTaskInput[];
}

export interface RecordNoModelImpactInput {
  expectedIterationVersion: number;
  storyId: string;
  storyRevisionId: string;
  storyRevisionSha256: string;
  reason: string;
}

export interface MaterializedTaskingCommand {
  testId: string;
  stepId: string;
  projectId: string | null;
  command: string;
}

export interface PairExecutionBudget {
  policyId: 'pair-default';
  policyVersion: 1;
  policySha256: string;
  activityTimeoutMs: number;
  commandTimeoutMs: number;
  maxAgentCalls: number;
  maxCheckpoints: number;
  maxRetriesPerFingerprint: number;
  maxNoProgressCheckpoints: number;
}

export interface MaterializedTaskingGate {
  projectId: string | null;
  target: string | null;
  command: string;
}

export interface TaskingProcessSelection {
  runtimePlanId: string;
  processId: string;
  processVersion: 3;
  definitionSha256: string;
  functionalContexts: TaskingFunctionalContext[];
  technicalBoundaries: TaskingTechnicalBoundary[];
  selectedStepIds: string[];
  projectIds: string[];
  projectCatalogSha256: string;
  focusedCommands: MaterializedTaskingCommand[];
  qualityGates: MaterializedTaskingGate[];
  materializedSha256: string;
}

export interface TaskingTestDescription {
  id: string;
  quadrant: 'Q1' | 'Q2';
  intent: string;
  runtimePlanId: string;
  processId: string;
  stepId: string;
  projectId: string | null;
  testFilter: string;
  supportedBy: string[];
  scenarioIds: string[];
  scenarioOutcome: string | null;
  businessData: string[];
  modelRefs: { entities: []; associations: [] };
}

export interface TaskingTaskDescription {
  id: string;
  description: string;
  testIds: string[];
  dependsOn: string[];
  modelRefs: { entities: []; associations: [] };
}

export interface TaskingCandidateDescription {
  planVersion: 2;
  reference: string;
  iteration: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  storyRevisionSha256: string;
  baseCommitSha: string;
  noModelImpactDecision: Ref<string>;
  noModelImpactDecisionSha256: string;
  sequence: number;
  projectCatalog: TaskingProjectCatalogInput;
  projectCatalogSha256: string;
  tests: TaskingTestDescription[];
  tasks: TaskingTaskDescription[];
  processes: TaskingProcessSelection[];
  executionBudget: PairExecutionBudget;
  contentSha256: string;
  proposedBy: 'tasking-analyst';
  proposedAt: string;
}

export class TaskingCandidate
  implements Entity<string, TaskingCandidateDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: TaskingCandidateDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): TaskingCandidateDescription {
    return this.desc;
  }
}

export type DeskCheckAction =
  | 'approve'
  | 'revise'
  | 'architecture_gap'
  | 'process_gap'
  | 'scenario_gap';

export interface DeskCheckDecisionDescription {
  reference: string;
  iteration: Ref<string>;
  candidate: Ref<string>;
  candidateSha256: string;
  action: DeskCheckAction;
  reason: string | null;
  decidedBy: Ref<string>;
  decidedAt: string;
  contentSha256: string;
}

export class DeskCheckDecision
  implements Entity<string, DeskCheckDecisionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: DeskCheckDecisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): DeskCheckDecisionDescription {
    return this.desc;
  }
}

export interface ApprovedTaskingPlanDescription {
  iteration: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  taskingCandidate: Ref<string>;
  deskCheckDecision: Ref<string>;
  plan: TaskingCandidateDescription;
  contentSha256: string;
  approvedBy: Ref<string>;
  approvedAt: string;
}

export class ApprovedTaskingPlan
  implements Entity<string, ApprovedTaskingPlanDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: ApprovedTaskingPlanDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ApprovedTaskingPlanDescription {
    return this.desc;
  }
}

export interface TaskingView {
  iteration: Iteration;
  story: Story;
  storyRevision: StoryRevision;
  noModelImpactDecision: NoModelImpactDecision | null;
  currentCandidate: TaskingCandidate | null;
  decisions: DeskCheckDecision[];
  approvedPlan: ApprovedTaskingPlan | null;
  processCatalog: TaskingProcessDefinition[];
}

export interface DecideTaskingInput {
  expectedIterationVersion: number;
  candidateId: string;
  candidateSha256: string;
  action: DeskCheckAction;
  reason?: string | null;
}

export interface DeskCheckDecisionResult {
  iteration: Iteration;
  decision: DeskCheckDecision;
  approvedPlan: ApprovedTaskingPlan | null;
}

export interface WorkspaceTasking {
  findTasking(iterationId: string): Promise<TaskingView | null>;
  recordNoModelImpact(
    iterationId: string,
    input: RecordNoModelImpactInput,
    decidedByUserId: string,
  ): Promise<NoModelImpactDecision>;
  proposeTasking(
    iterationId: string,
    input: ProposeTaskingInput,
  ): Promise<TaskingCandidate>;
  decideTasking(
    iterationId: string,
    input: DecideTaskingInput,
    decidedByUserId: string,
  ): Promise<DeskCheckDecisionResult>;
}
