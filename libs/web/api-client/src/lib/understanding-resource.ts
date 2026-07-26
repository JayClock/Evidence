import type { Entity } from '@hateoas-ts/resource';
import type { components } from './openapi-schema.js';
import type {
  StoryResource,
  StoryRevisionResource,
} from './delivery-resource.js';
import type {
  IterationResource,
  KickoffResource,
} from './iteration-resource.js';

type UnderstandingSchema = components['schemas']['UnderstandingResource'];
type ClarificationSchema = components['schemas']['ClarificationResource'];
type ScenarioProposalSchema =
  components['schemas']['ScenarioProposalResource'];
type ClarificationAnswerResultSchema =
  components['schemas']['ClarificationAnswerResultResource'];
type UnderstandingDecisionResultSchema =
  components['schemas']['UnderstandingDecisionResultResource'];

export type AskClarificationInput =
  components['schemas']['AskClarificationInput'];
export type AnswerClarificationInput =
  components['schemas']['AnswerClarificationInput'];
export type ScenarioProposalInput =
  components['schemas']['ScenarioProposalInput'];
export type UnderstandingDecisionInput =
  components['schemas']['UnderstandingDecisionInput'];

export type UnderstandingResourceData = Omit<UnderstandingSchema, '_links'>;
export type ClarificationResourceData = ClarificationSchema;
export type ScenarioProposalResourceData = ScenarioProposalSchema;
export type ClarificationAnswerResultData = Omit<
  ClarificationAnswerResultSchema,
  '_links'
>;
export type UnderstandingDecisionResultData = Omit<
  UnderstandingDecisionResultSchema,
  '_links'
>;

export type UnderstandingResource = Entity<
  UnderstandingResourceData,
  {
    self: UnderstandingResource;
    iteration: IterationResource;
    story: StoryResource;
    kickoff: KickoffResource;
    'ask-question': ClarificationResource;
    'answer-question': ClarificationAnswerResultResource;
    'propose-scenarios': ScenarioProposalResource;
    decide: UnderstandingDecisionResultResource;
  }
>;

export type ClarificationResource = Entity<
  ClarificationResourceData,
  Record<never, never>
>;
export type ScenarioProposalResource = Entity<
  ScenarioProposalResourceData,
  Record<never, never>
>;
export type ClarificationAnswerResultResource = Entity<
  ClarificationAnswerResultData,
  {
    iteration: IterationResource;
    understanding: UnderstandingResource;
  }
>;
export type UnderstandingDecisionResultResource = Entity<
  UnderstandingDecisionResultData,
  {
    iteration: IterationResource;
    understanding: UnderstandingResource;
    'story-revision': StoryRevisionResource;
  }
>;
