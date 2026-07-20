import { Readable } from 'node:stream';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import {
  DiagramNode,
  DOMAIN_ARCHITECT,
  DomainError,
  type DomainArchitect,
  type ModelingEvent,
  type Workspace,
} from '@evidence/server-domain';
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
  constructor(
    private readonly resolver: ResourceResolver,
    @Inject(DOMAIN_ARCHITECT)
    private readonly domainArchitect: DomainArchitect,
  ) {}

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
  @Header('Cache-Control', 'no-cache, no-transform')
  async proposeModel(
    @Param('workspaceId') workspaceId: string,
    @Body() input: ProposeModelInput,
  ): Promise<StreamableFile> {
    if (
      typeof input.requirement !== 'string' ||
      input.requirement.trim().length === 0
    ) {
      throw DomainError.validation('requirement is required');
    }
    const [workspace] =
      await this.resolver.requireWorkspaceDiagram(workspaceId);
    const abortController = new AbortController();
    const events = this.domainArchitect.proposeModelStream({
      requirement: input.requirement,
      modelDirectory: workspaceModelDirectory(workspace),
      signal: abortController.signal,
    });
    const stream = Readable.from(modelingSseStream(events));
    stream.once('close', () => abortController.abort());
    return new StreamableFile(stream, { type: 'text/event-stream' });
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

export async function* modelingSseStream(
  events: AsyncIterable<ModelingEvent>,
): AsyncIterable<string> {
  let completed = false;
  try {
    for await (const event of events) {
      completed ||= event.type === 'completed';
      yield serializeModelingEvent(event);
    }
    if (!completed) {
      yield sse('complete', '');
    }
  } catch (error) {
    yield sse('error', errorMessage(error));
  }
}

function serializeModelingEvent(event: ModelingEvent): string {
  switch (event.type) {
    case 'text-chunk':
      return sse(null, event.chunk);
    case 'reasoning-started':
      return sse('thinking-start', '');
    case 'reasoning-chunk':
      return sse('thinking', event.chunk);
    case 'reasoning-ended':
      return sse('thinking-end', '');
    case 'tool-call-started':
      return sseJson('tool-call-start', {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      });
    case 'tool-call-delta':
      return sseJson('tool-call-delta', {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        chunk: event.chunk,
      });
    case 'tool-call-ready':
      return sseJson('tool-call', {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
      });
    case 'tool-execution-started':
      return sseJson('tool-execution-start', {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      });
    case 'tool-execution-updated':
      return sseJson('tool-execution-update', {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        partialResult: event.partialResult,
      });
    case 'tool-execution-ended':
      return sseJson('tool-execution-end', {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
        isError: event.isError,
      });
    case 'message-ended':
      return sse('message-end', '');
    case 'agent-ended':
      return sse('agent-end', '');
    case 'completed':
      return sse('complete', '');
  }
}

function sseJson(event: string, data: unknown): string {
  return sse(event, JSON.stringify(data));
}

function sse(event: string | null, data: string): string {
  const eventLine = event ? `event: ${event}\n` : '';
  const dataLines = data
    .split(/\r\n|\r|\n/)
    .map((line) => `data: ${line}`)
    .join('\n');
  return `${eventLine}${dataLines}\n\n`;
}

function workspaceModelDirectory(workspace: Workspace): string {
  const metadata = workspace.description().metadata;
  const evidenceRoot = metadata['evidenceRoot']?.trim();
  if (evidenceRoot) {
    return evidenceRoot;
  }
  const repositoryRoot = metadata['repositoryRoot']?.trim();
  return repositoryRoot ? join(repositoryRoot, '.evidence') : '.evidence';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
