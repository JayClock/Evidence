import { Inject, Injectable } from '@nestjs/common';
import { DomainError, USERS } from '@evidence/server-domain';
import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  InboxItem,
  InboxRevision,
  LogicalEntity,
  LogicalRelationship,
  Member,
  User,
  UserMemberships,
  Users,
  Workspace,
  WorkspaceDescription,
} from '@evidence/server-domain';

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

  currentUserId(): string {
    return 'desktop-user';
  }

  async requireCurrentUser(): Promise<User> {
    return this.requireUser(this.currentUserId());
  }

  async requireUserMemberships(userId: string): Promise<UserMemberships> {
    await this.requireUser(userId);
    return this.users.memberships(userId);
  }

  async createWorkspace(desc: WorkspaceDescription): Promise<Workspace> {
    const user = await this.requireCurrentUser();
    return this.users.workspaces().create(user.identity(), desc);
  }

  async requireWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.users.workspaces().findByIdentity(workspaceId);
    if (!workspace) {
      throw DomainError.notFound(`workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  async updateWorkspace(
    workspaceId: string,
    desc: WorkspaceDescription,
  ): Promise<Workspace> {
    return this.users.workspaces().update(workspaceId, desc);
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.users.workspaces().delete(workspaceId);
  }

  async requireWorkspaceMember(
    workspaceId: string,
    memberId: string,
  ): Promise<[Workspace, Member]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const member = await workspace.members().findByIdentity(memberId);
    if (!member) {
      throw DomainError.notFound(`workspace member ${memberId} not found`);
    }
    return [workspace, member];
  }

  async requireWorkspaceDiagram(
    workspaceId: string,
  ): Promise<[Workspace, Diagram]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const diagram = await workspace.diagram().get();
    return [workspace, diagram];
  }

  async requireDiagramNode(
    workspaceId: string,
    nodeId: string,
  ): Promise<[Workspace, Diagram, DiagramNode]> {
    const [workspace, diagram] =
      await this.requireWorkspaceDiagram(workspaceId);
    const node = await diagram.nodes().findByIdentity(nodeId);
    if (!node) {
      throw DomainError.notFound(`diagram node ${nodeId} not found`);
    }
    return [workspace, diagram, node];
  }

  async requireDiagramEdge(
    workspaceId: string,
    edgeId: string,
  ): Promise<[Workspace, Diagram, DiagramEdge]> {
    const [workspace, diagram] =
      await this.requireWorkspaceDiagram(workspaceId);
    const edge = await diagram.edges().findByIdentity(edgeId);
    if (!edge) {
      throw DomainError.notFound(`diagram edge ${edgeId} not found`);
    }
    return [workspace, diagram, edge];
  }

  async requireWorkspaceInboxItem(
    workspaceId: string,
    itemId: string,
  ): Promise<[Workspace, InboxItem]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const item = await workspace.inbox().findByIdentity(itemId);
    if (!item) {
      throw DomainError.notFound(`Inbox item ${itemId} not found`);
    }
    return [workspace, item];
  }

  async requireWorkspaceInboxRevision(
    workspaceId: string,
    itemId: string,
    revisionId: string,
  ): Promise<[Workspace, InboxItem, InboxRevision]> {
    const [workspace, item] = await this.requireWorkspaceInboxItem(
      workspaceId,
      itemId,
    );
    const revision = await workspace.findInboxRevision(itemId, revisionId);
    if (!revision) {
      throw DomainError.notFound(`Inbox revision ${revisionId} not found`);
    }
    return [workspace, item, revision];
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
