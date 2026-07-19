import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  DiagramNode,
  DomainError,
  type Workspace,
} from '@evidence/server-nest-domain';
import {
  link,
  Link,
  workspaceDiagramEdgesHref,
  workspaceDiagramHref,
  workspaceDiagramNodesHref,
} from './links';
import {
  diagramModel,
  DiagramModel,
  edgeModel,
  EdgeModel,
  nodeModel,
  NodeModel,
} from './model';
import { ResourceResolver } from './resource-resolver.service';

interface ProposeModelInput {
  requirement: string;
}

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

  @Get('propose-model')
  async getProposeModelDiagram(
    @Param('workspaceId') workspaceId: string,
  ): Promise<DiagramModel> {
    return this.getDiagram(workspaceId);
  }

  @Post('propose-model')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/event-stream')
  async proposeModel(
    @Param('workspaceId') workspaceId: string,
    @Body() input: ProposeModelInput,
  ): Promise<string> {
    if (
      typeof input.requirement !== 'string' ||
      input.requirement.trim().length === 0
    ) {
      throw DomainError.validation('requirement is required');
    }
    await this.resolver.requireWorkspaceDiagram(workspaceId);
    return 'event: complete\ndata: \n\n';
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
