import { randomUUID } from 'node:crypto';
import {
  DiagramVersion,
  DiagramVersionDescription,
  DiagramVersions,
  HasMany,
  Ref,
} from '../domain';
import { DiagramVersionRecord, InMemoryStore, now } from './records';

export class InMemoryDiagramVersions
  implements DiagramVersions, HasMany<DiagramVersion>
{
  constructor(
    private readonly store: InMemoryStore,
    private readonly diagramId: string,
  ) {}

  async findAll(from: number, to: number): Promise<DiagramVersion[]> {
    return this.records()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(from, to)
      .map((record) => this.assemble(record));
  }

  async findByIdentity(id: string): Promise<DiagramVersion | null> {
    const record = this.store.diagramVersions.get(id);
    if (!record || record.diagramId !== this.diagramId) {
      return null;
    }
    return this.assemble(record);
  }

  async size(): Promise<number> {
    return this.records().length;
  }

  async add(desc: DiagramVersionDescription): Promise<DiagramVersion> {
    const id = randomUUID();
    const timestamp = now();
    const record: DiagramVersionRecord = {
      id,
      diagramId: this.diagramId,
      name: desc.name,
      snapshot: desc.snapshot,
      createdAt: timestamp,
    };
    this.store.diagramVersions.set(id, record);
    return this.assemble(record);
  }

  private records(): DiagramVersionRecord[] {
    return [...this.store.diagramVersions.values()].filter(
      (record) => record.diagramId === this.diagramId,
    );
  }

  private assemble(record: DiagramVersionRecord): DiagramVersion {
    return new DiagramVersion(record.id, {
      diagram: new Ref(record.diagramId),
      name: record.name,
      snapshot: record.snapshot,
      createdAt: record.createdAt,
    });
  }
}
