import { Entity, HasMany } from '../core';
import {
  Diagram,
  DiagramDescription,
  DraftEdge,
  DraftNode,
  WorkspaceDiagrams,
} from '../diagram';
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

  addMember(desc: MemberDescription): Promise<Member> {
    return this.workspaceMembers.addMember(desc);
  }

  removeMember(userId: string): Promise<void> {
    return this.workspaceMembers.removeMember(userId);
  }

  diagrams(): HasMany<Diagram> {
    return this.workspaceDiagrams;
  }

  addDiagram(desc: DiagramDescription): Promise<Diagram> {
    return this.workspaceDiagrams.add(desc);
  }

  updateDiagram(
    diagramId: string,
    desc: DiagramDescription,
  ): Promise<Diagram> {
    return this.workspaceDiagrams.update(diagramId, desc);
  }

  deleteDiagram(diagramId: string): Promise<void> {
    return this.workspaceDiagrams.delete(diagramId);
  }

  listDiagrams(
    page: number,
    pageSize: number,
  ): Promise<[Diagram[], number]> {
    return this.workspaceDiagrams.list(page, pageSize);
  }

  saveDiagram(
    diagramId: string,
    draftNodes: DraftNode[],
    draftEdges: DraftEdge[],
  ): Promise<void> {
    return this.workspaceDiagrams.saveDiagram(diagramId, draftNodes, draftEdges);
  }

  publishDiagram(diagramId: string): Promise<void> {
    return this.workspaceDiagrams.publishDiagram(diagramId);
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
