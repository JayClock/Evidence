import type { Entity } from '@hateoas-ts/resource';
import type { components } from './openapi-schema.js';
import type {
  StoryResource,
  StoryRevisionResource,
} from './delivery-resource.js';
import type { IterationResource } from './iteration-resource.js';
import type { PairResource } from './pair-resource.js';
import type { TaskingResource } from './tasking-resource.js';

type ShowcaseSchema = components['schemas']['ShowcaseResource'];
type ShowcaseActionResultSchema =
  components['schemas']['ShowcaseActionResultResource'];

export type ShowcaseResourceData = Omit<ShowcaseSchema, '_links'>;
export type ShowcaseRunData = components['schemas']['ShowcaseRunResource'];
export type ShowcaseNextAction = components['schemas']['ShowcaseNextAction'];
export type ShowcaseStage = components['schemas']['ShowcaseStage'];
export type ShowcaseQuadrant = components['schemas']['ShowcaseQuadrant'];
export type ShowcaseRiskActivity =
  components['schemas']['ShowcaseRiskActivity'];
export type ShowcaseFeedbackTarget =
  components['schemas']['ShowcaseFeedbackTarget'];
export type RecordShowcaseQ2ObservationInput =
  components['schemas']['RecordShowcaseQ2ObservationInput'];
export type RecordShowcaseProductObservationInput =
  components['schemas']['RecordShowcaseProductObservationInput'];
export type RecordShowcaseRiskDecisionInput =
  components['schemas']['RecordShowcaseRiskDecisionInput'];
export type RecordShowcaseEvaluationInput =
  components['schemas']['RecordShowcaseEvaluationInput'];
export type RecordShowcaseReviewInput =
  components['schemas']['RecordShowcaseReviewInput'];
export type DecideShowcaseInput = components['schemas']['DecideShowcaseInput'];
export type ShowcaseActionResultData = Omit<
  ShowcaseActionResultSchema,
  '_links'
>;

export type ShowcaseActionResultResource = Entity<
  ShowcaseActionResultData,
  { self: ShowcaseResource }
>;

export type ShowcaseResource = Entity<
  ShowcaseResourceData,
  {
    self: ShowcaseResource;
    iteration: IterationResource;
    pair: PairResource;
    tasking: TaskingResource;
    story: StoryResource;
    'story-revision': StoryRevisionResource;
    'record-q2-observation': ShowcaseActionResultResource;
    'record-product-observation': ShowcaseActionResultResource;
    'record-risk-decision': ShowcaseActionResultResource;
    'record-evaluation': ShowcaseActionResultResource;
    'record-review': ShowcaseActionResultResource;
    decide: ShowcaseActionResultResource;
  }
>;
