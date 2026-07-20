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

export interface ModelingRequest {
  requirement: string;
  modelDirectory: string;
  signal?: AbortSignal;
}

export type ModelingEvent =
  | { type: 'text-chunk'; chunk: string }
  | { type: 'reasoning-started' }
  | { type: 'reasoning-chunk'; chunk: string }
  | { type: 'reasoning-ended' }
  | { type: 'tool-call-started'; toolCallId: string; toolName: string | null }
  | {
      type: 'tool-call-delta';
      toolCallId: string;
      toolName: string | null;
      chunk: string;
    }
  | {
      type: 'tool-call-ready';
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: 'tool-execution-started';
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: 'tool-execution-updated';
      toolCallId: string;
      toolName: string;
      args: unknown;
      partialResult: unknown;
    }
  | {
      type: 'tool-execution-ended';
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | { type: 'message-ended' }
  | { type: 'agent-ended' }
  | { type: 'completed' };

export interface DomainArchitect {
  proposeModelStream(request: ModelingRequest): AsyncIterable<ModelingEvent>;
}

export const DOMAIN_ARCHITECT = Symbol('DOMAIN_ARCHITECT');
