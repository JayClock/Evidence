import { randomUUID } from 'node:crypto';
import {
  DiagramVersion,
  DiagramVersionDescription,
  DiagramVersions,
} from '@evidence/server-nest-domain';
import { EntityList } from '../database';
import { assembleDiagramVersion } from './mappers';
import type { PrismaStore } from './types';
import { inputJson, now } from './utils';

export class PrismaDiagramVersions
  extends EntityList<DiagramVersion>
  implements DiagramVersions
{
  constructor(
    private readonly store: PrismaStore,
    private readonly diagramId: string,
  ) {
    super();
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<DiagramVersion[]> {
    const rows = await this.store.diagramVersion.findMany({
      where: { diagramId: this.diagramId },
      orderBy: { createdAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleDiagramVersion);
  }

  protected override async findEntity(
    id: string,
  ): Promise<DiagramVersion | null> {
    const row = await this.store.diagramVersion.findFirst({
      where: { id, diagramId: this.diagramId },
    });
    return row ? assembleDiagramVersion(row) : null;
  }

  override async size(): Promise<number> {
    return this.store.diagramVersion.count({
      where: { diagramId: this.diagramId },
    });
  }

  async add(desc: DiagramVersionDescription): Promise<DiagramVersion> {
    const row = await this.store.diagramVersion.create({
      data: {
        id: randomUUID(),
        diagramId: this.diagramId,
        name: desc.name,
        snapshot: inputJson(desc.snapshot),
        createdAt: now(),
      },
    });
    return assembleDiagramVersion(row);
  }
}
