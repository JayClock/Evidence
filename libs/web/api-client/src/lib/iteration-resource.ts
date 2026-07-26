import type { Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';
import type {
  StoryCandidateResource,
  StoryResource,
} from './delivery-resource.js';
import type { WorkspaceResource } from './workspace-resource.js';

type IterationSchema = components['schemas']['IterationResource'];
type IterationIntakeSchema = components['schemas']['IterationIntakeResource'];
type KickoffSchema = components['schemas']['KickoffResource'];
type KickoffProposalSchema = components['schemas']['KickoffProposalResource'];
type KickoffDecisionResultSchema =
  components['schemas']['KickoffDecisionResultResource'];

export type KickoffDecisionInput =
  components['schemas']['KickoffDecisionInput'];
export type KickoffDecisionAction = KickoffDecisionInput['action'];
export type KickoffReplacementInput =
  components['schemas']['KickoffReplacementInput'];
export type StoryCardResource = components['schemas']['StoryCardResource'];
export type ProblemStatementResource =
  components['schemas']['ProblemStatementResource'];

export type IterationResourceData = Omit<IterationSchema, '_links'>;
export type IterationIntakeResourceData = Omit<IterationIntakeSchema, '_links'>;
export type KickoffResourceData = Omit<KickoffSchema, '_links'>;
export type KickoffProposalResourceData = Omit<KickoffProposalSchema, '_links'>;
export type KickoffDecisionResultResourceData = Omit<
  KickoffDecisionResultSchema,
  '_links'
>;

export type IterationResource = Entity<
  IterationResourceData,
  {
    self: IterationResource;
    workspace: WorkspaceResource;
    candidate: StoryCandidateResource;
    intake: IterationIntakeResource;
    kickoff: KickoffResource;
    story: StoryResource;
  }
>;

export type IterationIntakeResource = Entity<
  IterationIntakeResourceData,
  {
    self: IterationIntakeResource;
    iteration: IterationResource;
  }
>;

export type KickoffProposalResource = Entity<
  KickoffProposalResourceData,
  {
    self: KickoffProposalResource;
    iteration: IterationResource;
    decide: KickoffDecisionResultResource;
  }
>;

export type KickoffResource = Entity<
  KickoffResourceData,
  {
    self: KickoffResource;
    iteration: IterationResource;
    intake: IterationIntakeResource;
    'propose-replacement': KickoffProposalResource;
    decide: KickoffDecisionResultResource;
  }
>;

export type KickoffDecisionResultResource = Entity<
  KickoffDecisionResultResourceData,
  {
    iteration: IterationResource;
    kickoff: KickoffResource;
  }
>;
