import type { Entity } from '@hateoas-ts/resource';
import type { components } from './openapi-schema.js';
import type {
  StoryResource,
  StoryRevisionResource,
} from './delivery-resource.js';
import type { IterationResource } from './iteration-resource.js';
import type { ShowcaseResource } from './showcase-resource.js';

type RespondSchema = components['schemas']['RespondResource'];
type RespondActionResultSchema =
  components['schemas']['RespondActionResultResource'];

export type RespondResourceData = Omit<RespondSchema, '_links'>;
export type RespondNextAction = components['schemas']['RespondNextAction'];
export type RespondPromotion = components['schemas']['RespondPromotion'];
export type RespondNextProbe = components['schemas']['RespondNextProbe'];
export type RespondKnowledgeKind =
  components['schemas']['RespondKnowledgeKind'];
export type ProposeRespondCandidateInput =
  components['schemas']['ProposeRespondCandidateInput'];
export type DecideRespondInput = components['schemas']['DecideRespondInput'];
export type RespondActionResultData = Omit<RespondActionResultSchema, '_links'>;

export type RespondActionResultResource = Entity<
  RespondActionResultData,
  { self: RespondResource }
>;

export type RespondResource = Entity<
  RespondResourceData,
  {
    self: RespondResource;
    iteration: IterationResource;
    showcase: ShowcaseResource;
    story: StoryResource;
    'story-revision': StoryRevisionResource;
    'propose-candidate': RespondActionResultResource;
    decide: RespondActionResultResource;
  }
>;
