import type { Entity } from '@hateoas-ts/resource';
import type { components } from './openapi-schema.js';
import type {
  StoryResource,
  StoryRevisionResource,
} from './delivery-resource.js';
import type { IterationResource } from './iteration-resource.js';
import type { ShowcaseResource } from './showcase-resource.js';
import type { TaskingResource } from './tasking-resource.js';

type PairSchema = components['schemas']['PairResource'];

export type PairResourceData = Omit<PairSchema, '_links'>;
export type PairRunData = components['schemas']['PairRunResource'];
export type PairNextAction = components['schemas']['PairNextAction'];
export type PairDriverAction = components['schemas']['PairRunDriverAction'];
export type PairCommandAction =
  components['schemas']['PairExecuteCommandAction'];
export type PairReviewRedAction = components['schemas']['PairReviewRedAction'];
export type PairExecutionManifestData =
  components['schemas']['PairExecutionManifestResource'];
export type StartPairInput = components['schemas']['StartPairInput'];
export type StartPairResultData =
  components['schemas']['StartPairResultResource'];
export type ClaimPairLeaseInput = components['schemas']['ClaimPairLeaseInput'];
export type ClaimPairLeaseResultData =
  components['schemas']['ClaimPairLeaseResult'];
export type HeartbeatPairLeaseInput =
  components['schemas']['HeartbeatPairLeaseInput'];
export type RecordPairDriverAttemptInput =
  components['schemas']['RecordPairDriverAttemptInput'];
export type RecordPairCommandObservationInput =
  components['schemas']['RecordPairCommandObservationInput'];
export type RecordPairRedReviewInput =
  components['schemas']['RecordPairRedReviewInput'];
export type RecordPairExceptionInput =
  components['schemas']['RecordPairExceptionInput'];
export type DecidePairInput = components['schemas']['DecidePairInput'];
export type PairActionResultData =
  components['schemas']['PairActionResultResource'];
export type PairDecisionAction = components['schemas']['PairDecisionAction'];

export type StartPairResultResource = Entity<
  Omit<StartPairResultData, '_links'>,
  { self: PairResource }
>;

export type PairActionResultResource = Entity<
  Omit<PairActionResultData, '_links'>,
  { self: PairResource }
>;

export type PairResource = Entity<
  PairResourceData,
  {
    self: PairResource;
    iteration: IterationResource;
    tasking: TaskingResource;
    story: StoryResource;
    'story-revision': StoryRevisionResource;
    'claim-lease': PairResource;
    'heartbeat-lease': PairResource;
    'record-driver-attempt': PairResource;
    'record-command-observation': PairResource;
    'record-red-review': PairResource;
    'record-exception': PairResource;
    decide: PairResource;
    showcase: ShowcaseResource;
  }
>;
