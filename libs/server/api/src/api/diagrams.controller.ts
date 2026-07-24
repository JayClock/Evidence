import { Controller, Get, Param } from '@nestjs/common';
import { DiagramNode, type Workspace } from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceDiagramEdgesHref,
  workspaceDiagramHref,
  workspaceDiagramNodesHref,
} from './links';
import {
  diagramModel,
  type DiagramModel,
  edgeModel,
  type EdgeModel,
  nodeModel,
  type NodeModel,
} from './model';
import { ResourceResolver } from './resource-resolver.service';

@Controller()
export class DiagramsController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async getDiagram(
    @Param('workspaceId') workspaceId: string,
  ): Promise<DiagramModel> {
    const [, diagram] =
      await this.resolver.requireWorkspaceDiagram(workspaceId);
    return diagramModel(diagram);
  }

  @Get('nodes')
  async listNodes(@Param('workspaceId') workspaceId: string): Promise<{
    _links: Record<string, Link>;
    _embedded: { nodes: NodeModel[] };
  }> {
    const [workspace, diagram] =
      await this.resolver.requireWorkspaceDiagram(workspaceId);
    const nodes = await diagram
      .nodes()
      .findAll()
      .subCollection(0, Number.MAX_SAFE_INTEGER)
      .toArray();
    return {
      _links: {
        self: link(workspaceDiagramNodesHref(workspaceId)),
        diagram: link(workspaceDiagramHref(workspaceId)),
      },
      _embedded: { nodes: await this.nodeResources(workspace, nodes) },
    };
  }

  @Get('nodes/:nodeId')
  async getNode(
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<NodeModel> {
    const [workspace, , node] = await this.resolver.requireDiagramNode(
      workspaceId,
      nodeId,
    );
    return this.nodeResource(workspace, node);
  }

  @Get('edges')
  async listEdges(@Param('workspaceId') workspaceId: string): Promise<{
    _links: Record<string, Link>;
    _embedded: { edges: EdgeModel[] };
  }> {
    const [, diagram] =
      await this.resolver.requireWorkspaceDiagram(workspaceId);
    const edges = await diagram
      .edges()
      .findAll()
      .subCollection(0, Number.MAX_SAFE_INTEGER)
      .toArray();
    return {
      _links: {
        self: link(workspaceDiagramEdgesHref(workspaceId)),
        diagram: link(workspaceDiagramHref(workspaceId)),
      },
      _embedded: { edges: edges.map((edge) => edgeModel(workspaceId, edge)) },
    };
  }

  @Get('edges/:edgeId')
  async getEdge(
    @Param('workspaceId') workspaceId: string,
    @Param('edgeId') edgeId: string,
  ): Promise<EdgeModel> {
    const [, , edge] = await this.resolver.requireDiagramEdge(
      workspaceId,
      edgeId,
    );
    return edgeModel(workspaceId, edge);
  }

  private async nodeResources(
    workspace: Workspace,
    nodes: DiagramNode[],
  ): Promise<NodeModel[]> {
    const resources: NodeModel[] = [];
    for (const node of nodes) {
      resources.push(await this.nodeResource(workspace, node));
    }
    return resources;
  }

  private async nodeResource(
    workspace: Workspace,
    node: DiagramNode,
  ): Promise<NodeModel> {
    const logicalEntityRef = node.description().logicalEntity;
    const logicalEntity = logicalEntityRef
      ? await workspace.logicalEntities().findByIdentity(logicalEntityRef.id())
      : null;
    return nodeModel(workspace.identity(), node, logicalEntity);
  }
}
