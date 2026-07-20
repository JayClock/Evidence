import { Entity, HasMany, HasOne } from '../core';
import { Diagram, WorkspaceDiagram } from '../diagram';
import {
  LogicalEntity,
  LogicalEntityDescription,
  WorkspaceLogicalEntities,
} from '../logical-entity';
import {
  LogicalRelationship,
  LogicalRelationshipDescription,
  WorkspaceLogicalRelationships,
} from '../logical-relationship';
import { Member, MemberDescription, WorkspaceMembers } from '../member';

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
    private readonly workspaceDiagram: WorkspaceDiagram,
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

  addMember(desc: MemberDescription): Promise<Member> {
    return this.workspaceMembers.addMember(desc);
  }

  updateMember(memberId: string, role: string): Promise<Member> {
    return this.workspaceMembers.updateMember(memberId, role);
  }

  removeMember(memberId: string): Promise<void> {
    return this.workspaceMembers.removeMember(memberId);
  }

  diagram(): HasOne<Diagram> {
    return this.workspaceDiagram;
  }

  logicalEntities(): HasMany<LogicalEntity> {
    return this.workspaceLogicalEntities;
  }

  addLogicalEntity(desc: LogicalEntityDescription): Promise<LogicalEntity> {
    return this.workspaceLogicalEntities.add(desc);
  }

  updateLogicalEntity(
    entityId: string,
    desc: LogicalEntityDescription,
  ): Promise<LogicalEntity> {
    return this.workspaceLogicalEntities.update(entityId, desc);
  }

  deleteLogicalEntity(entityId: string): Promise<void> {
    return this.workspaceLogicalEntities.delete(entityId);
  }

  listLogicalEntities(
    page: number,
    pageSize: number,
  ): Promise<[LogicalEntity[], number]> {
    return this.workspaceLogicalEntities.list(page, pageSize);
  }

  logicalRelationships(): HasMany<LogicalRelationship> {
    return this.workspaceLogicalRelationships;
  }

  addLogicalRelationship(
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    return this.workspaceLogicalRelationships.add(desc);
  }

  updateLogicalRelationship(
    relationshipId: string,
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    return this.workspaceLogicalRelationships.update(relationshipId, desc);
  }

  deleteLogicalRelationship(relationshipId: string): Promise<void> {
    return this.workspaceLogicalRelationships.delete(relationshipId);
  }

  listLogicalRelationships(
    page: number,
    pageSize: number,
  ): Promise<[LogicalRelationship[], number]> {
    return this.workspaceLogicalRelationships.list(page, pageSize);
  }
}
