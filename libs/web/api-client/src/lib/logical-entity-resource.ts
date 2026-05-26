import type { Collection, Entity } from '@hateoas-ts/resource';

import type { WorkspaceResource } from './workspace-resource.js';

export type LogicalEntityType = 'EVIDENCE' | 'PARTICIPANT' | 'ROLE' | 'CONTEXT';

export type EvidenceSubType =
  | 'rfp'
  | 'proposal'
  | 'contract'
  | 'fulfillment_request'
  | 'fulfillment_confirmation'
  | 'other_evidence';

export type ParticipantSubType = 'party' | 'thing';

export type RoleSubType =
  | 'party'
  | 'domain'
  | '3rd system'
  | 'context'
  | 'evidence';

export type ContextSubType = 'bounded_context';

export type LogicalEntitySubType =
  | `EVIDENCE:${EvidenceSubType}`
  | `PARTICIPANT:${ParticipantSubType}`
  | `ROLE:${RoleSubType}`
  | `CONTEXT:${ContextSubType}`;

export type EntityAttribute = {
  id: string;
  name: string;
  label: string | null;
  type: string | null;
  description: string | null;
  isBusinessKey: boolean;
  relation: boolean;
  visibility: string | null;
};

export type EntityBehavior = {
  id: string;
  name: string;
  label: string | null;
  description: string | null;
  returnType: string | null;
};

export type EntityDefinition = {
  description?: string | null;
  tags: string[];
  attributes: EntityAttribute[];
  behaviors: EntityBehavior[];
};

export type LogicalEntityResource = Entity<
  {
    id: string;
    type: LogicalEntityType;
    subType: LogicalEntitySubType | null;
    name: string;
    label: string | null;
    definition: EntityDefinition | null;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: LogicalEntityResource;
    workspace: WorkspaceResource;
    collection: LogicalEntityCollectionResource;
  }
>;

export type LogicalEntityCollectionResource =
  Collection<LogicalEntityResource> &
    Entity<
      {
        page: {
          number: number;
          size: number;
          totalElements: number;
          totalPages: number;
        };
      },
      {
        self: LogicalEntityCollectionResource;
        workspace: WorkspaceResource;
        prev: LogicalEntityCollectionResource;
        next: LogicalEntityCollectionResource;
      }
    >;
