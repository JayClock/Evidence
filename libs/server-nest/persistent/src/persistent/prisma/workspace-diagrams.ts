import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import {
  defaultViewport,
  Diagram,
  DiagramDescription,
  DomainError,
  Ref,
  WorkspaceDiagrams,
} from '@evidence/server-nest-domain';
import { EntityList } from '../database';
import { PrismaDiagramEdges } from './diagram-edges';
import { PrismaDiagramNodes } from './diagram-nodes';
import { assembleDiagram } from './mappers';
import type { PrismaStore } from './types';
import { inputJson, now, rejectInvalidPage } from './utils';

const PROJECTED_DIAGRAM_ID = 'model';
const PROJECTED_DIAGRAM_TITLE = 'Model';

export class PrismaWorkspaceDiagrams
  extends EntityList<Diagram>
  implements WorkspaceDiagrams
{
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
    private readonly evidenceRoot = '.evidence',
  ) {
    super();
  }

  async get(): Promise<Diagram> {
    const timestamp = await fileTimestamp(this.evidenceRoot);
    return new Diagram(
      PROJECTED_DIAGRAM_ID,
      {
        workspace: new Ref(this.workspaceId),
        title: PROJECTED_DIAGRAM_TITLE,
        viewport: defaultViewport(),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      new PrismaDiagramNodes(this.store, PROJECTED_DIAGRAM_ID),
      new PrismaDiagramEdges(this.store, PROJECTED_DIAGRAM_ID),
    );
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<Diagram[]> {
    const rows = await this.store.diagram.findMany({
      where: this.visibleWhere(),
      orderBy: { updatedAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map((row) => assembleDiagram(this.store, row));
  }

  protected override async findEntity(id: string): Promise<Diagram | null> {
    const row = await this.store.diagram.findFirst({
      where: { ...this.visibleWhere(), id },
    });
    return row ? assembleDiagram(this.store, row) : null;
  }

  override async size(): Promise<number> {
    return this.store.diagram.count({ where: this.visibleWhere() });
  }

  async add(desc: DiagramDescription): Promise<Diagram> {
    const timestamp = now();
    const row = await this.store.diagram.create({
      data: {
        id: randomUUID(),
        workspaceId: this.workspaceId,
        title: normalizeTitle(desc.title),
        viewport: inputJson(desc.viewport ?? defaultViewport()),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return assembleDiagram(this.store, row);
  }

  async update(diagramId: string, desc: DiagramDescription): Promise<Diagram> {
    const current = await this.store.diagram.findFirst({
      where: { ...this.visibleWhere(), id: diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram ${diagramId} not found`);
    }
    const timestamp = now();
    const row = await this.store.diagram.update({
      where: { id: diagramId },
      data: {
        title: normalizeTitle(desc.title),
        viewport: inputJson(desc.viewport),
        updatedAt: timestamp,
      },
    });
    return assembleDiagram(this.store, row);
  }

  async delete(diagramId: string): Promise<void> {
    const current = await this.store.diagram.findFirst({
      where: { ...this.visibleWhere(), id: diagramId },
    });
    if (!current) {
      throw DomainError.notFound(`diagram ${diagramId} not found`);
    }
    const timestamp = now();
    await this.store.diagram.update({
      where: { id: diagramId },
      data: { deletedAt: timestamp, updatedAt: timestamp },
    });
  }

  async list(page: number, pageSize: number): Promise<[Diagram[], number]> {
    rejectInvalidPage(page, pageSize);
    const [rows, total] = await Promise.all([
      this.store.diagram.findMany({
        where: this.visibleWhere(),
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.store.diagram.count({ where: this.visibleWhere() }),
    ]);
    return [rows.map((row) => assembleDiagram(this.store, row)), total];
  }

  private visibleWhere() {
    return { workspaceId: this.workspaceId, deletedAt: null };
  }
}

async function fileTimestamp(path: string): Promise<string> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return '';
  }
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length === 0) {
    throw DomainError.validation('diagram title must not be empty');
  }
  return normalized;
}
