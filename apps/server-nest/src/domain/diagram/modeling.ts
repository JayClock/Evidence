import { EntityAttribute, LogicalEntityType } from '../logical-entity';
import { Ref } from '../core';

export interface ModelingProposal {
  summary: string;
  changes: ModelingProposalChanges;
}

export interface ModelingProposalChanges {
  addEntities: ModelingDraftEntity[];
  updateEntities: ModelingDraftEntity[];
  deleteEntities: string[];
  addRelationships: ModelingDraftRelationship[];
  updateRelationships: ModelingDraftRelationship[];
  deleteRelationships: string[];
}

export interface ModelingDraftEntity {
  id: string;
  name: string;
  label: string | null;
  type: LogicalEntityType;
  subType: string | null;
  description: string | null;
  attributes: EntityAttribute[];
}

export interface ModelingDraftRelationship {
  id: string | null;
  source: Ref<string>;
  target: Ref<string>;
  label: string | null;
}
