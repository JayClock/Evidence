import { Entity, Ref } from '../core';
import type {
  IterationLifecycle,
  IterationLoop,
  IterationStage,
} from '../iteration/iteration';

export type StoryCognitiveMode = 'clear' | 'complicated' | 'complex';

export type StoryAuthorityOwner = 'human' | 'agent' | 'none';
export type StoryNextAction =
  | 'answer_clarification'
  | 'run_understanding_analyst'
  | 'review_scenario_set'
  | 'record_model_impact'
  | 'run_tasking_analyst'
  | 'review_tasking_candidate'
  | 'start_pair'
  | 'run_pair'
  | 'route_pair_exception'
  | 'review_pair_change'
  | 'run_showcase'
  | 'record_showcase_evidence'
  | 'review_showcase'
  | 'decide_showcase'
  | 'draft_response'
  | 'none';

export interface StoryWorkflowAuthority {
  owner: StoryAuthorityOwner;
  nextAction: StoryNextAction;
}

export interface StoryWorkflowAuthorityInput {
  lifecycle: IterationLifecycle;
  loop: IterationLoop;
  stage: IterationStage;
  hasPendingClarification: boolean;
}

export interface StoryStageCount {
  loop: IterationLoop;
  stage: IterationStage;
  count: number;
}

export interface StoryActionCount {
  action: StoryNextAction;
  count: number;
}

export interface StoryPortfolioSummary {
  humanAttention: number;
  agentAttention: number;
  approved: number;
  stages: StoryStageCount[];
  actions: StoryActionCount[];
}

export interface StoryCitationInput {
  inboxItemId: string;
  inboxRevisionId: string;
  contentSha256: string;
  locator: string;
}

export interface StoryCitationDescription {
  inboxItem: Ref<string>;
  inboxRevision: Ref<string>;
  inboxRevisionNumber: number;
  contentSha256: string;
  locator: string;
}

export interface StoryContentInput {
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: StoryCognitiveMode;
  citations: StoryCitationInput[];
}

export interface StoryScenarioInput {
  title: string;
  given: string[];
  when: string;
  then: string[];
  businessData: string[];
}

export interface StoryScenarioDescription extends StoryScenarioInput {
  id: string;
  reference: string;
  sourceDraftId: string;
}

export interface StoryRevisionInput extends StoryContentInput {
  scenarios: StoryScenarioInput[];
}

export interface StoryDescription {
  workspace: Ref<string>;
  iteration: Ref<string>;
  iterationReference: string;
  iterationLifecycle: IterationLifecycle;
  iterationLoop: IterationLoop;
  iterationStage: IterationStage;
  reference: 'US-001';
  title: string;
  goal: string;
  latestRevision: Ref<string>;
  latestRevisionNumber: number;
  latestScenarioCount: number;
  latestCitationCount: number;
  pendingClarificationReference: string | null;
  authority: StoryWorkflowAuthority;
  revisionCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class Story implements Entity<string, StoryDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: StoryDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): StoryDescription {
    return this.desc;
  }
}

export interface StoryRevisionDescription {
  story: Ref<string>;
  revisionNumber: number;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: StoryCognitiveMode;
  citations: StoryCitationDescription[];
  scenarios: StoryScenarioDescription[];
  contentSha256: string;
  createdBy: Ref<string>;
  createdAt: string;
}

export class StoryRevision implements Entity<string, StoryRevisionDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: StoryRevisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): StoryRevisionDescription {
    return this.desc;
  }
}

export interface StoryListQuery {
  page: number;
  pageSize: number;
}

export function storyWorkflowAuthority(
  input: StoryWorkflowAuthorityInput,
): StoryWorkflowAuthority {
  if (input.lifecycle !== 'active') {
    return { owner: 'none', nextAction: 'none' };
  }

  if (input.loop === 'understand') {
    if (input.stage === 'tqa') {
      return input.hasPendingClarification
        ? { owner: 'human', nextAction: 'answer_clarification' }
        : { owner: 'agent', nextAction: 'run_understanding_analyst' };
    }
    if (input.stage === 'scenario_review') {
      return { owner: 'human', nextAction: 'review_scenario_set' };
    }
    if (input.stage === 'modeling') {
      return { owner: 'human', nextAction: 'record_model_impact' };
    }
  }

  if (input.loop === 'tasking') {
    if (input.stage === 'drafting' || input.stage === 'knowledge_gap') {
      return { owner: 'agent', nextAction: 'run_tasking_analyst' };
    }
    if (input.stage === 'desk_check') {
      return { owner: 'human', nextAction: 'review_tasking_candidate' };
    }
    if (input.stage === 'approved') {
      return { owner: 'human', nextAction: 'start_pair' };
    }
  }

  if (input.loop === 'pair') {
    if (input.stage === 'quality_gate_failed' || input.stage === 'exception') {
      return { owner: 'human', nextAction: 'route_pair_exception' };
    }
    if (input.stage === 'quality_gates_passed') {
      return { owner: 'human', nextAction: 'review_pair_change' };
    }
    if (input.stage === 'approved') {
      return { owner: 'none', nextAction: 'none' };
    }
    return { owner: 'agent', nextAction: 'run_pair' };
  }

  if (input.loop === 'showcase') {
    if (input.stage === 'setup') {
      return { owner: 'human', nextAction: 'record_showcase_evidence' };
    }
    if (input.stage === 'reviewing') {
      return { owner: 'agent', nextAction: 'review_showcase' };
    }
    if (input.stage === 'decision') {
      return { owner: 'human', nextAction: 'decide_showcase' };
    }
    return { owner: 'none', nextAction: 'none' };
  }

  if (input.loop === 'respond' && input.stage === 'drafting') {
    return { owner: 'agent', nextAction: 'draft_response' };
  }

  return { owner: 'none', nextAction: 'none' };
}

export interface WorkspaceDelivery {
  listStories(query: StoryListQuery): Promise<[Story[], number]>;
  summarizeStories(): Promise<StoryPortfolioSummary>;
  findStory(storyId: string): Promise<Story | null>;
  listStoryRevisions(
    storyId: string,
    page: number,
    pageSize: number,
  ): Promise<[StoryRevision[], number]>;
  findStoryRevision(
    storyId: string,
    revisionId: string,
  ): Promise<StoryRevision | null>;
}
