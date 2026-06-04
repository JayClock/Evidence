import { randomUUID } from 'node:crypto';
import {
  defaultViewport,
  Diagram,
  DiagramDescription,
  DiagramStatus,
  DraftEdge,
  DraftNode,
  HasMany,
  Ref,
  ServerError,
  WorkspaceDiagrams,
} from '../domain';
import { InMemoryDiagramEdges } from './in-memory-diagram-edges';
import { InMemoryDiagramNodes } from './in-memory-diagram-nodes';
import { InMemoryDiagramVersions } from './in-memory-diagram-versions';
import { DiagramRecord, InMemoryStore, now } from './records';

export class InMemoryWorkspaceDiagrams
  implements WorkspaceDiagrams, HasMany<Diagram>
{
  constructor(
    private readonly store: InMemoryStore,
    private readonly workspaceId: string,
  ) {}

  async findAll(from: number, to: number): Promise<Diagram[]> {
    return this.records()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(from, to)
      .map((record) => this.assemble(record));
  }

  async findByIdentity(id: string): Promise<Diagram | null> {
    const record = this.store.diagrams.get(id);
    if (
      !record ||
      record.workspaceId !== this.workspaceId ||
      record.deletedAt !== null
    ) {
      return null;
    }
    return this.assemble(record);
  }

  async size(): Promise<number> {
    return this.records().length;
  }

  async add(desc: DiagramDescription): Promise<Diagram> {
    const title = normalizeTitle(desc.title);
    const id = randomUUID();
    const timestamp = now();
    const description: DiagramDescription = {
      ...desc,
      workspace: new Ref(this.workspaceId),
      title,
      viewport: desc.viewport ?? defaultViewport(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const record: DiagramRecord = {
      id,
      workspaceId: this.workspaceId,
      description,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    this.store.diagrams.set(id, record);
    return this.assemble(record);
  }

  async update(diagramId: string, desc: DiagramDescription): Promise<Diagram> {
    const current = this.store.diagrams.get(diagramId);
    if (
      !current ||
      current.workspaceId !== this.workspaceId ||
      current.deletedAt !== null
    ) {
      throw ServerError.notFound(`diagram ${diagramId} not found`);
    }
    const timestamp = now();
    const description: DiagramDescription = {
      ...desc,
      workspace: new Ref(this.workspaceId),
      title: normalizeTitle(desc.title),
      createdAt: current.createdAt,
      updatedAt: timestamp,
    };
    const record: DiagramRecord = {
      ...current,
      description,
      updatedAt: timestamp,
    };
    this.store.diagrams.set(diagramId, record);
    return this.assemble(record);
  }

  async delete(diagramId: string): Promise<void> {
    const current = this.store.diagrams.get(diagramId);
    if (
      !current ||
      current.workspaceId !== this.workspaceId ||
      current.deletedAt !== null
    ) {
      throw ServerError.notFound(`diagram ${diagramId} not found`);
    }
    const timestamp = now();
    this.store.diagrams.set(diagramId, {
      ...current,
      deletedAt: timestamp,
      updatedAt: timestamp,
      description: { ...current.description, updatedAt: timestamp },
    });
  }

  async list(page: number, pageSize: number): Promise<[Diagram[], number]> {
    if (page === 0 || pageSize === 0) {
      throw ServerError.validation('page and pageSize must be greater than 0');
    }
    const rows = this.records().sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
    const total = rows.length;
    const offset = (page - 1) * pageSize;
    return [
      rows
        .slice(offset, offset + pageSize)
        .map((record) => this.assemble(record)),
      total,
    ];
  }

  async saveDiagram(
    diagramId: string,
    draftNodes: DraftNode[],
    draftEdges: DraftEdge[],
  ): Promise<void> {
    if (diagramId.trim().length === 0) {
      throw ServerError.validation('diagram id must be provided');
    }
    const current = this.store.diagrams.get(diagramId);
    if (
      !current ||
      current.workspaceId !== this.workspaceId ||
      current.deletedAt !== null
    ) {
      throw ServerError.notFound(`diagram ${diagramId} not found`);
    }

    const nodeIds = new Set(draftNodes.map((node) => node.id));
    for (const edge of draftEdges) {
      if (!nodeIds.has(edge.description.source.id())) {
        throw ServerError.validation(
          `draft edge source node not found: ${edge.description.source.id()}`,
        );
      }
      if (!nodeIds.has(edge.description.target.id())) {
        throw ServerError.validation(
          `draft edge target node not found: ${edge.description.target.id()}`,
        );
      }
    }

    await new InMemoryDiagramNodes(this.store, diagramId).replaceAll(
      draftNodes,
    );
    await new InMemoryDiagramEdges(this.store, diagramId).replaceAll(
      draftEdges,
    );
    const timestamp = now();
    this.store.diagrams.set(diagramId, {
      ...current,
      updatedAt: timestamp,
      description: {
        ...current.description,
        status: 'draft' satisfies DiagramStatus,
        updatedAt: timestamp,
      },
    });
  }

  async publishDiagram(diagramId: string): Promise<void> {
    const current = this.store.diagrams.get(diagramId);
    if (
      !current ||
      current.workspaceId !== this.workspaceId ||
      current.deletedAt !== null
    ) {
      throw ServerError.notFound(`diagram ${diagramId} not found`);
    }
    const timestamp = now();
    this.store.diagrams.set(diagramId, {
      ...current,
      updatedAt: timestamp,
      description: {
        ...current.description,
        status: 'published',
        updatedAt: timestamp,
      },
    });
  }

  private records(): DiagramRecord[] {
    return [...this.store.diagrams.values()].filter(
      (record) =>
        record.workspaceId === this.workspaceId && record.deletedAt === null,
    );
  }

  private assemble(record: DiagramRecord): Diagram {
    return new Diagram(
      record.id,
      {
        ...record.description,
        workspace: new Ref(record.workspaceId),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new InMemoryDiagramNodes(this.store, record.id),
      new InMemoryDiagramEdges(this.store, record.id),
      new InMemoryDiagramVersions(this.store, record.id),
    );
  }
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length === 0) {
    throw ServerError.validation('diagram title must not be empty');
  }
  return normalized;
}
