import type { Entity } from '@hateoas-ts/resource';
import type { components } from './openapi-schema.js';
import type {
  StoryResource,
  StoryRevisionResource,
} from './delivery-resource.js';
import type { IterationResource } from './iteration-resource.js';
import type { PairResource, StartPairResultResource } from './pair-resource.js';

type TaskingSchema = components['schemas']['TaskingResource'];
type NoModelImpactDecisionSchema =
  components['schemas']['NoModelImpactDecisionResource'];
type TaskingCandidateSchema = components['schemas']['TaskingCandidateResource'];
type DeskCheckDecisionResultSchema =
  components['schemas']['DeskCheckDecisionResultResource'];

export type RecordNoModelImpactInput =
  components['schemas']['RecordNoModelImpactInput'];
export type ProposeTaskingInput = components['schemas']['ProposeTaskingInput'];
export type DeskCheckDecisionInput =
  components['schemas']['DeskCheckDecisionInput'];
export type DeskCheckAction = components['schemas']['DeskCheckAction'];
export type TaskingProjectCatalog =
  components['schemas']['TaskingProjectCatalog'];
export type ApprovedTaskingPlanData =
  components['schemas']['ApprovedTaskingPlanResource'];

export type TaskingResourceData = Omit<TaskingSchema, '_links'>;
export type NoModelImpactDecisionData = Omit<
  NoModelImpactDecisionSchema,
  '_links'
>;
export type TaskingCandidateData = Omit<TaskingCandidateSchema, '_links'>;
export type DeskCheckDecisionResultData = Omit<
  DeskCheckDecisionResultSchema,
  '_links'
>;

export type TaskingResource = Entity<
  TaskingResourceData,
  {
    self: TaskingResource;
    iteration: IterationResource;
    story: StoryResource;
    'story-revision': StoryRevisionResource;
    'record-no-model-impact': NoModelImpactDecisionResource;
    'propose-candidate': TaskingCandidateResource;
    decide: DeskCheckDecisionResultResource;
    pair: PairResource;
    'start-pair': StartPairResultResource;
  }
>;

export type NoModelImpactDecisionResource = Entity<
  NoModelImpactDecisionData,
  {
    tasking: TaskingResource;
    iteration: IterationResource;
    story: StoryResource;
    'story-revision': StoryRevisionResource;
  }
>;

export type TaskingCandidateResource = Entity<
  TaskingCandidateData,
  {
    tasking: TaskingResource;
    iteration: IterationResource;
    decide: DeskCheckDecisionResultResource;
  }
>;

export type DeskCheckDecisionResultResource = Entity<
  DeskCheckDecisionResultData,
  {
    tasking: TaskingResource;
    iteration: IterationResource;
  }
>;
