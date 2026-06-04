import { Inject, Injectable } from '@nestjs/common';
import { DomainError, USERS } from '../domain';
import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  LogicalEntity,
  LogicalRelationship,
  Member,
  User,
  Users,
  Workspace,
} from '../domain';

@Injectable()
export class ResourceResolver {
  constructor(@Inject(USERS) private readonly users: Users) {}

  async requireUser(userId: string): Promise<User> {
    const user = await this.users.findByIdentity(userId);
    if (!user) {
      throw DomainError.notFound(`user ${userId} not found`);
    }
    return user;
  }

  async requireWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.users.workspaces().findByIdentity(workspaceId);
    if (!workspace) {
      throw DomainError.notFound(`workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  async requireUserWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<Workspace> {
    const user = await this.requireUser(userId);
    const workspace = await user.workspaces().findByIdentity(workspaceId);
    if (!workspace) {
      throw DomainError.notFound(`workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  async requireUserWorkspaceMember(
    userId: string,
    workspaceId: string,
    memberId: string,
  ): Promise<[Workspace, Member]> {
    const workspace = await this.requireUserWorkspace(userId, workspaceId);
    const member = await workspace.members().findByIdentity(memberId);
    if (!member) {
      throw DomainError.notFound(`workspace member ${memberId} not found`);
    }
    return [workspace, member];
  }

  async requireWorkspaceDiagram(
    workspaceId: string,
    diagramId: string,
  ): Promise<[Workspace, Diagram]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const diagram = await workspace.diagrams().findByIdentity(diagramId);
    if (!diagram) {
      throw DomainError.notFound(`diagram ${diagramId} not found`);
    }
    return [workspace, diagram];
  }

  async requireDiagramNode(
    workspaceId: string,
    diagramId: string,
    nodeId: string,
  ): Promise<[Workspace, Diagram, DiagramNode]> {
    const [workspace, diagram] = await this.requireWorkspaceDiagram(
      workspaceId,
      diagramId,
    );
    const node = await diagram.nodes().findByIdentity(nodeId);
    if (!node) {
      throw DomainError.notFound(`diagram node ${nodeId} not found`);
    }
    return [workspace, diagram, node];
  }

  async requireDiagramEdge(
    workspaceId: string,
    diagramId: string,
    edgeId: string,
  ): Promise<[Workspace, Diagram, DiagramEdge]> {
    const [workspace, diagram] = await this.requireWorkspaceDiagram(
      workspaceId,
      diagramId,
    );
    const edge = await diagram.edges().findByIdentity(edgeId);
    if (!edge) {
      throw DomainError.notFound(`diagram edge ${edgeId} not found`);
    }
    return [workspace, diagram, edge];
  }

  async requireWorkspaceLogicalEntity(
    workspaceId: string,
    entityId: string,
  ): Promise<[Workspace, LogicalEntity]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const entity = await workspace.logicalEntities().findByIdentity(entityId);
    if (!entity) {
      throw DomainError.notFound(`logical entity ${entityId} not found`);
    }
    return [workspace, entity];
  }

  async requireWorkspaceLogicalRelationship(
    workspaceId: string,
    relationshipId: string,
  ): Promise<[Workspace, LogicalRelationship]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const relationship = await workspace
      .logicalRelationships()
      .findByIdentity(relationshipId);
    if (!relationship) {
      throw DomainError.notFound(
        `logical relationship ${relationshipId} not found`,
      );
    }
    return [workspace, relationship];
  }
}
