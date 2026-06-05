import { randomUUID } from 'node:crypto';
import {
  DiagramVersion,
  DiagramVersionDescription,
  DiagramVersions,
  HasMany,
} from '@evidence/server-nest-domain';
import { assembleDiagramVersion } from './mappers';
import type { PrismaStore } from './types';
import { inputJson, now } from './utils';

export class PrismaDiagramVersions
  implements DiagramVersions, HasMany<DiagramVersion>
{
  constructor(
    private readonly store: PrismaStore,
    private readonly diagramId: string,
  ) {}

  async findAll(from: number, to: number): Promise<DiagramVersion[]> {
    const rows = await this.store.diagramVersion.findMany({
      where: { diagramId: this.diagramId },
      orderBy: { createdAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleDiagramVersion);
  }

  async findByIdentity(id: string): Promise<DiagramVersion | null> {
    const row = await this.store.diagramVersion.findFirst({
      where: { id, diagramId: this.diagramId },
    });
    return row ? assembleDiagramVersion(row) : null;
  }

  async size(): Promise<number> {
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
