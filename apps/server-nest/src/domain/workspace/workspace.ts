import { Entity, HasMany } from '../core';
import { Diagram, WorkspaceDiagrams } from '../diagram';
import { LogicalEntity, WorkspaceLogicalEntities } from '../logical-entity';
import {
  LogicalRelationship,
  WorkspaceLogicalRelationships,
} from '../logical-relationship';
import { Member, WorkspaceMembers } from '../member';

export interface WorkspaceDescription {
  title: string;
  description: string | null;
  status: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export class Workspace implements Entity<string, WorkspaceDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: WorkspaceDescription,
    private readonly workspaceMembers: WorkspaceMembers,
    private readonly workspaceDiagrams: WorkspaceDiagrams,
    private readonly workspaceLogicalEntities: WorkspaceLogicalEntities,
    private readonly workspaceLogicalRelationships: WorkspaceLogicalRelationships,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): WorkspaceDescription {
    return this.desc;
  }

  members(): HasMany<Member> {
    return this.workspaceMembers;
  }

  membersWide(): WorkspaceMembers {
    return this.workspaceMembers;
  }

  diagrams(): HasMany<Diagram> {
    return this.workspaceDiagrams;
  }

  diagramsWide(): WorkspaceDiagrams {
    return this.workspaceDiagrams;
  }

  logicalEntities(): HasMany<LogicalEntity> {
    return this.workspaceLogicalEntities;
  }

  logicalEntitiesWide(): WorkspaceLogicalEntities {
    return this.workspaceLogicalEntities;
  }

  logicalRelationships(): HasMany<LogicalRelationship> {
    return this.workspaceLogicalRelationships;
  }

  logicalRelationshipsWide(): WorkspaceLogicalRelationships {
    return this.workspaceLogicalRelationships;
  }
}
