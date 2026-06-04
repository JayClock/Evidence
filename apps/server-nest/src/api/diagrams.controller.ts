import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  defaultPosition,
  defaultViewport,
  Diagram,
  DiagramDescription,
  DiagramNode,
  DiagramVersion,
  DraftEdge,
  DraftNode,
  EdgeDescription,
  JsonObject,
  NodeDescription,
  parseDiagramStatus,
  parseDiagramType,
  Position,
  Ref,
  DomainError,
  USERS,
  Viewport,
} from '../domain';
import type { Users, Workspace } from '../domain';
import {
  link,
  Link,
  workspaceDiagramEdgesHref,
  workspaceDiagramHref,
  workspaceDiagramNodesHref,
  workspaceDiagramsHref,
  workspaceDiagramVersionsHref,
} from './links';
import {
  diagramModel,
  DiagramModel,
  edgeModel,
  EdgeModel,
  nodeModel,
  NodeModel,
} from './model';
import { parsePositiveInteger, totalPages } from './request';

interface RefInput {
  id: string;
}

interface CreateDiagramInput {
  title: string;
  type?: string | null;
}

interface UpdateDiagramInput {
  title?: string | null;
  type?: string | null;
  status?: string | null;
  viewport?: Viewport | null;
  'viewport.x'?: number | null;
  'viewport.y'?: number | null;
  'viewport.zoom'?: number | null;
}

interface NodeInput {
  id?: string | null;
  kind: string;
  logicalEntity?: RefInput | null;
  parent?: RefInput | null;
  position?: Position | null;
  width?: number | null;
  height?: number | null;
  data?: JsonObject | null;
}

interface EdgeInput {
  id?: string | null;
  source: RefInput;
  target: RefInput;
  logicalRelationship?: RefInput | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  kind?: string | null;
  style?: JsonObject | null;
  data?: JsonObject | null;
  animated?: boolean | null;
  hidden?: boolean | null;
  markerStart?: JsonObject | null;
  markerEnd?: JsonObject | null;
  pathOptions?: JsonObject | null;
  interactionWidth?: number | null;
}

interface CommitDraftInput {
  nodes?: NodeInput[] | null;
  edges?: EdgeInput[] | null;
}

interface ProposeModelInput {
  requirement: string;
}

interface DiagramCollectionModel {
  _links: Record<string, Link>;
  _templates: Record<string, unknown>;
  _embedded: { diagrams: DiagramModel[] };
  page: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

@Controller('workspaces/:workspaceId/diagrams')
export class DiagramsController {
  constructor(@Inject(USERS) private readonly users: Users) {}

  @Get()
  async listDiagrams(
    @Param('workspaceId') workspaceId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
  ): Promise<DiagramCollectionModel> {
    const workspace = await this.loadWorkspace(workspaceId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 50, 'pageSize'),
      100,
    );
    const [diagrams, total] = await workspace.listDiagrams(page, pageSize);
    return diagramCollection(workspaceId, diagrams, page, pageSize, total);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDiagram(
    @Param('workspaceId') workspaceId: string,
    @Body() input: CreateDiagramInput,
  ): Promise<DiagramModel> {
    const workspace = await this.loadWorkspace(workspaceId);
    const diagram = await workspace.addDiagram({
      workspace: new Ref(workspaceId),
      title: input.title,
      type: input.type ? parseDiagramType(input.type) : 'class',
      viewport: defaultViewport(),
      status: 'draft',
      createdAt: '',
      updatedAt: '',
    });
    return diagramModel(diagram);
  }

  @Get(':diagramId')
  async getDiagram(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<DiagramModel> {
    const [, diagram] = await this.loadDiagram(workspaceId, diagramId);
    return diagramModel(diagram);
  }

  @Put(':diagramId')
  async updateDiagram(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Body() input: UpdateDiagramInput,
  ): Promise<DiagramModel> {
    const [workspace, existing] = await this.loadDiagram(workspaceId, diagramId);
    const current = existing.description();
    const viewport = { ...(input.viewport ?? current.viewport) };
    if (input['viewport.x'] !== undefined && input['viewport.x'] !== null) {
      viewport.x = input['viewport.x'];
    }
    if (input['viewport.y'] !== undefined && input['viewport.y'] !== null) {
      viewport.y = input['viewport.y'];
    }
    if (
      input['viewport.zoom'] !== undefined &&
      input['viewport.zoom'] !== null
    ) {
      viewport.zoom = input['viewport.zoom'];
    }
    const desc: DiagramDescription = {
      workspace: current.workspace,
      title: input.title ?? current.title,
      type: input.type ? parseDiagramType(input.type) : current.type,
      status: input.status ? parseDiagramStatus(input.status) : current.status,
      viewport,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    };
    const diagram = await workspace.updateDiagram(diagramId, desc);
    return diagramModel(diagram);
  }

  @Delete(':diagramId')
  async deleteDiagram(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<{ deleted: true }> {
    const workspace = await this.loadWorkspace(workspaceId);
    await workspace.deleteDiagram(diagramId);
    return { deleted: true };
  }

  @Get(':diagramId/nodes')
  async listNodes(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<{ _links: Record<string, Link>; _embedded: { nodes: NodeModel[] } }> {
    const [workspace, diagram] = await this.loadDiagram(workspaceId, diagramId);
    const nodes = await diagram.nodes().findAll(0, Number.MAX_SAFE_INTEGER);
    return {
      _links: {
        self: link(workspaceDiagramNodesHref(workspaceId, diagramId)),
        diagram: link(workspaceDiagramHref(workspaceId, diagramId)),
      },
      _embedded: { nodes: await this.nodeResources(workspace, nodes) },
    };
  }

  @Post(':diagramId/nodes')
  async createNode(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Body() input: NodeInput,
  ): Promise<NodeModel> {
    const [workspace, diagram] = await this.loadDiagram(workspaceId, diagramId);
    const node = await diagram.addNodeWithId(
      input.id ?? null,
      nodeDescription(diagramId, input),
    );
    return this.nodeResource(workspace, node);
  }

  @Get(':diagramId/nodes/:nodeId')
  async getNode(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<NodeModel> {
    const [workspace, diagram] = await this.loadDiagram(workspaceId, diagramId);
    const node = await diagram.nodes().findByIdentity(nodeId);
    if (!node) {
      throw DomainError.notFound(`diagram node ${nodeId} not found`);
    }
    return this.nodeResource(workspace, node);
  }

  @Put(':diagramId/nodes/:nodeId')
  async updateNode(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Param('nodeId') nodeId: string,
    @Body() input: NodeInput,
  ): Promise<NodeModel> {
    const [workspace, diagram] = await this.loadDiagram(workspaceId, diagramId);
    const node = await diagram.updateNode(
      nodeId,
      nodeDescription(diagramId, input),
    );
    return this.nodeResource(workspace, node);
  }

  @Delete(':diagramId/nodes/:nodeId')
  async deleteNode(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<{ deleted: true }> {
    const [, diagram] = await this.loadDiagram(workspaceId, diagramId);
    await diagram.deleteNode(nodeId);
    return { deleted: true };
  }

  @Get(':diagramId/edges')
  async listEdges(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<{ _links: Record<string, Link>; _embedded: { edges: EdgeModel[] } }> {
    const [, diagram] = await this.loadDiagram(workspaceId, diagramId);
    const edges = await diagram.edges().findAll(0, Number.MAX_SAFE_INTEGER);
    return {
      _links: {
        self: link(workspaceDiagramEdgesHref(workspaceId, diagramId)),
        diagram: link(workspaceDiagramHref(workspaceId, diagramId)),
      },
      _embedded: { edges: edges.map((edge) => edgeModel(workspaceId, edge)) },
    };
  }

  @Post(':diagramId/edges')
  async createEdge(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Body() input: EdgeInput,
  ): Promise<EdgeModel> {
    const [, diagram] = await this.loadDiagram(workspaceId, diagramId);
    const edge = await diagram.addEdgeWithId(
      input.id ?? null,
      edgeDescription(diagramId, input),
    );
    return edgeModel(workspaceId, edge);
  }

  @Get(':diagramId/edges/:edgeId')
  async getEdge(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Param('edgeId') edgeId: string,
  ): Promise<EdgeModel> {
    const [, diagram] = await this.loadDiagram(workspaceId, diagramId);
    const edge = await diagram.edges().findByIdentity(edgeId);
    if (!edge) {
      throw DomainError.notFound(`diagram edge ${edgeId} not found`);
    }
    return edgeModel(workspaceId, edge);
  }

  @Put(':diagramId/edges/:edgeId')
  async updateEdge(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Param('edgeId') edgeId: string,
    @Body() input: EdgeInput,
  ): Promise<EdgeModel> {
    const [, diagram] = await this.loadDiagram(workspaceId, diagramId);
    const edge = await diagram.updateEdge(
      edgeId,
      edgeDescription(diagramId, input),
    );
    return edgeModel(workspaceId, edge);
  }

  @Delete(':diagramId/edges/:edgeId')
  async deleteEdge(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Param('edgeId') edgeId: string,
  ): Promise<{ deleted: true }> {
    const [, diagram] = await this.loadDiagram(workspaceId, diagramId);
    await diagram.deleteEdge(edgeId);
    return { deleted: true };
  }

  @Get(':diagramId/versions')
  async listVersions(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<{ _links: Record<string, Link>; _embedded: { versions: unknown[] } }> {
    const [, diagram] = await this.loadDiagram(workspaceId, diagramId);
    const versions = await diagram.versions().findAll(0, Number.MAX_SAFE_INTEGER);
    return {
      _links: {
        self: link(workspaceDiagramVersionsHref(workspaceId, diagramId)),
        diagram: link(workspaceDiagramHref(workspaceId, diagramId)),
      },
      _embedded: {
        versions: versions.map((version) => versionResource(workspaceId, version)),
      },
    };
  }

  @Post(':diagramId/versions')
  async createVersion(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<unknown> {
    const [, diagram] = await this.loadDiagram(workspaceId, diagramId);
    return versionResource(workspaceId, await diagram.createVersion());
  }

  @Get(':diagramId/commit-draft')
  async getCommitDraftDiagram(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<DiagramModel> {
    return this.getDiagram(workspaceId, diagramId);
  }

  @Post(':diagramId/commit-draft')
  async commitDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Body() input: CommitDraftInput,
  ): Promise<{ committed: true }> {
    const workspace = await this.loadWorkspace(workspaceId);
    const nodes = (input.nodes ?? []).map((nodeInput) => {
      if (!nodeInput.id) {
        throw DomainError.validation('draft node id is required');
      }
      return {
        id: nodeInput.id,
        description: nodeDescription(diagramId, nodeInput),
      } satisfies DraftNode;
    });
    const edges = (input.edges ?? []).map(
      (edgeInput) =>
        ({
          id: edgeInput.id ?? null,
          description: edgeDescription(diagramId, edgeInput),
        }) satisfies DraftEdge,
    );
    await workspace.saveDiagram(diagramId, nodes, edges);
    return { committed: true };
  }

  @Get(':diagramId/propose-model')
  async getProposeModelDiagram(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<DiagramModel> {
    return this.getDiagram(workspaceId, diagramId);
  }

  @Post(':diagramId/propose-model')
  @Header('Content-Type', 'text/event-stream')
  async proposeModel(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
    @Body() input: ProposeModelInput,
  ): Promise<string> {
    if (input.requirement.trim().length === 0) {
      throw DomainError.validation('requirement is required');
    }
    await this.loadDiagram(workspaceId, diagramId);
    return 'event: complete\ndata: \n\n';
  }

  @Get(':diagramId/publish')
  async getPublishDiagram(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<DiagramModel> {
    return this.getDiagram(workspaceId, diagramId);
  }

  @Post(':diagramId/publish')
  async publishDiagram(
    @Param('workspaceId') workspaceId: string,
    @Param('diagramId') diagramId: string,
  ): Promise<{ published: true }> {
    const workspace = await this.loadWorkspace(workspaceId);
    await workspace.publishDiagram(diagramId);
    return { published: true };
  }

  private async loadWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.users.workspaces().findByIdentity(workspaceId);
    if (!workspace) {
      throw DomainError.notFound(`workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  private async loadDiagram(
    workspaceId: string,
    diagramId: string,
  ): Promise<[Workspace, Diagram]> {
    const workspace = await this.loadWorkspace(workspaceId);
    const diagram = await workspace.diagrams().findByIdentity(diagramId);
    if (!diagram) {
      throw DomainError.notFound(`diagram ${diagramId} not found`);
    }
    return [workspace, diagram];
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

function nodeDescription(diagramId: string, input: NodeInput): NodeDescription {
  return {
    diagram: new Ref(diagramId),
    kind: input.kind,
    logicalEntity: input.logicalEntity ? new Ref(input.logicalEntity.id) : null,
    parent: input.parent ? new Ref(input.parent.id) : null,
    position: input.position ?? defaultPosition(),
    width: input.width ?? null,
    height: input.height ?? null,
    data: input.data ?? {},
    createdAt: '',
    updatedAt: '',
  };
}

function edgeDescription(diagramId: string, input: EdgeInput): EdgeDescription {
  return {
    diagram: new Ref(diagramId),
    source: new Ref(input.source.id),
    target: new Ref(input.target.id),
    logicalRelationship: input.logicalRelationship
      ? new Ref(input.logicalRelationship.id)
      : null,
    sourceHandle: input.sourceHandle ?? null,
    targetHandle: input.targetHandle ?? null,
    kind: input.kind ?? null,
    style: input.style ?? {},
    data: input.data ?? {},
    animated: input.animated ?? false,
    hidden: input.hidden ?? false,
    markerStart: input.markerStart ?? null,
    markerEnd: input.markerEnd ?? null,
    pathOptions: input.pathOptions ?? {},
    interactionWidth: input.interactionWidth ?? null,
    createdAt: '',
    updatedAt: '',
  };
}

function diagramCollection(
  workspaceId: string,
  diagrams: Diagram[],
  page: number,
  pageSize: number,
  total: number,
): DiagramCollectionModel {
  const pages = totalPages(total, pageSize);
  const links: Record<string, Link> = {
    self: link(
      `${workspaceDiagramsHref(workspaceId)}?page=${page}&pageSize=${pageSize}`,
    ),
    workspace: link(`/api/workspaces/${workspaceId}`),
  };
  if (page > 1) {
    links.prev = link(
      `${workspaceDiagramsHref(workspaceId)}?page=${page - 1}&pageSize=${pageSize}`,
    );
  }
  if (page < pages) {
    links.next = link(
      `${workspaceDiagramsHref(workspaceId)}?page=${page + 1}&pageSize=${pageSize}`,
    );
  }
  return {
    _links: links,
    _templates: { 'create-diagram': createDiagramTemplate(workspaceId) },
    _embedded: { diagrams: diagrams.map(diagramModel) },
    page: {
      number: page,
      size: pageSize,
      totalElements: total,
      totalPages: pages,
    },
  };
}

function createDiagramTemplate(workspaceId: string): unknown {
  return {
    title: 'Create diagram',
    method: 'POST',
    target: workspaceDiagramsHref(workspaceId),
    contentType: 'application/json',
    properties: [
      {
        name: 'title',
        prompt: 'Title',
        type: 'text',
        required: true,
        minLength: 1,
      },
      {
        name: 'type',
        prompt: 'Type',
        type: 'text',
        value: 'fulfillment',
        required: false,
        options: {
          inline: [
            { value: 'fulfillment', prompt: 'Fulfillment' },
            { value: 'flowchart', prompt: 'Flowchart' },
            { value: 'sequence', prompt: 'Sequence' },
            { value: 'class', prompt: 'Class' },
            { value: 'component', prompt: 'Component' },
            { value: 'state', prompt: 'State' },
            { value: 'activity', prompt: 'Activity' },
          ],
        },
      },
    ],
  };
}

function versionResource(workspaceId: string, version: DiagramVersion): unknown {
  const versionId = version.identity();
  const description = version.description();
  const diagramId = description.diagram.id();
  return {
    _links: {
      self: link(
        `/api/workspaces/${workspaceId}/diagrams/${diagramId}/versions/${versionId}`,
      ),
      diagram: link(workspaceDiagramHref(workspaceId, diagramId)),
    },
    id: versionId,
    name: description.name,
    snapshot: description.snapshot,
    createdAt: description.createdAt,
  };
}
