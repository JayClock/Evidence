import { randomUUID } from 'node:crypto';
import {
  DomainError,
  HasMany,
  UserWorkspaces,
  Workspace,
  WorkspaceDescription,
} from '../../domain';
import { assembleWorkspace } from './mappers';
import type { PrismaStore } from './types';
import { defaultIfBlank, inputJson, now, rejectInvalidPage } from './utils';

export class PrismaUserWorkspaces
  implements UserWorkspaces, HasMany<Workspace>
{
  constructor(
    private readonly store: PrismaStore,
    private readonly userId: string | null,
  ) {}

  async findAll(from: number, to: number): Promise<Workspace[]> {
    const rows = await this.store.workspace.findMany({
      where: this.visibleWhere(),
      orderBy: { updatedAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map((row) => assembleWorkspace(this.store, row));
  }

  async findByIdentity(id: string): Promise<Workspace | null> {
    const row = await this.store.workspace.findFirst({
      where: { ...this.visibleWhere(), id },
    });
    return row ? assembleWorkspace(this.store, row) : null;
  }

  async size(): Promise<number> {
    return this.store.workspace.count({ where: this.visibleWhere() });
  }

  async list(
    page: number,
    pageSize: number,
    query: string | null,
  ): Promise<[Workspace[], number]> {
    rejectInvalidPage(page, pageSize);
    const normalizedQuery = query?.trim() ?? '';
    const where = {
      ...this.visibleWhere(),
      ...(normalizedQuery.length > 0
        ? {
            OR: [
              {
                title: {
                  contains: normalizedQuery,
                  mode: 'insensitive' as const,
                },
              },
              {
                description: {
                  contains: normalizedQuery,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    } as const;
    const [rows, total] = await Promise.all([
      this.store.workspace.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.store.workspace.count({ where }),
    ]);
    return [rows.map((row) => assembleWorkspace(this.store, row)), total];
  }

  async create(desc: WorkspaceDescription): Promise<Workspace> {
    const id = randomUUID();
    const timestamp = now();
    const title = normalizeTitle(desc.title);
    const createWorkspace = async (db: PrismaStore): Promise<Workspace> => {
      const row = await db.workspace.create({
        data: {
          id,
          title,
          description: desc.description,
          status: defaultIfBlank(desc.status, 'active'),
          metadata: inputJson(desc.metadata),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });

      if (this.userId) {
        await db.workspaceMember.create({
          data: {
            id: randomUUID(),
            workspaceId: id,
            userId: this.userId,
            role: 'owner',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        });
      }

      return assembleWorkspace(this.store, row);
    };

    if ('$transaction' in this.store) {
      return this.store.$transaction((tx) => createWorkspace(tx));
    }
    return createWorkspace(this.store);
  }

  async update(id: string, desc: WorkspaceDescription): Promise<Workspace> {
    const current = await this.findByIdentity(id);
    if (!current) {
      throw DomainError.notFound(`workspace ${id} not found`);
    }

    const row = await this.store.workspace.update({
      where: { id },
      data: {
        title: normalizeTitle(desc.title),
        description: desc.description,
        status: defaultIfBlank(desc.status, 'active'),
        metadata: inputJson(desc.metadata),
        updatedAt: now(),
      },
    });
    return assembleWorkspace(this.store, row);
  }

  async delete(id: string): Promise<void> {
    const current = await this.findByIdentity(id);
    if (!current) {
      throw DomainError.notFound(`workspace ${id} not found`);
    }
    const timestamp = now();
    await this.store.workspace.update({
      where: { id },
      data: { deletedAt: timestamp, updatedAt: timestamp },
    });
  }

  private visibleWhere() {
    return {
      deletedAt: null,
      ...(this.userId ? { members: { some: { userId: this.userId } } } : {}),
    };
  }
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length === 0) {
    throw DomainError.validation('workspace title must not be empty');
  }
  return normalized;
}
