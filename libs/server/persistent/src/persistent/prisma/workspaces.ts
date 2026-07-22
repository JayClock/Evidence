import { randomUUID } from 'node:crypto';
import {
  DomainError,
  Workspace,
  WorkspaceDescription,
  Workspaces,
} from '@evidence/server-domain';
import { EntityList } from '../database';
import {
  initializeWorkspaceModelRoot,
  publicWorkspaceMetadata,
} from '../workspace-paths';
import { assembleWorkspace } from './mappers';
import type { PrismaStore } from './types';
import { defaultIfBlank, inputJson, now } from './utils';

export class PrismaWorkspaces
  extends EntityList<Workspace>
  implements Workspaces
{
  constructor(
    private readonly store: PrismaStore,
    private readonly modelStorageRoot = process.env
      .EVIDENCE_WORKSPACE_STORAGE_ROOT,
  ) {
    super();
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<Workspace[]> {
    const rows = await this.store.workspace.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map((row) => assembleWorkspace(this.store, row));
  }

  protected override async findEntity(id: string): Promise<Workspace | null> {
    const row = await this.store.workspace.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? assembleWorkspace(this.store, row) : null;
  }

  override async size(): Promise<number> {
    return this.store.workspace.count({ where: { deletedAt: null } });
  }

  async create(
    ownerUserId: string,
    desc: WorkspaceDescription,
  ): Promise<Workspace> {
    const id = randomUUID();
    const timestamp = now();
    const metadata = publicWorkspaceMetadata(desc.metadata);
    const title = normalizeTitle(desc.title);
    const modelRoot = await initializeWorkspaceModelRoot(
      id,
      this.modelStorageRoot,
    );
    const createWorkspace = async (db: PrismaStore): Promise<Workspace> => {
      const row = await db.workspace.create({
        data: {
          id,
          title,
          description: desc.description,
          status: defaultIfBlank(desc.status, 'active'),
          metadata: inputJson(metadata),
          modelRoot,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });

      await db.workspaceMember.create({
        data: {
          id: randomUUID(),
          workspaceId: id,
          userId: ownerUserId,
          role: 'owner',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });

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

    const metadataInput =
      Object.keys(desc.metadata).length === 0
        ? current.description().metadata
        : desc.metadata;
    const metadata = publicWorkspaceMetadata(metadataInput);
    const row = await this.store.workspace.update({
      where: { id },
      data: {
        title: normalizeTitle(desc.title),
        description: desc.description,
        status: defaultIfBlank(desc.status, 'active'),
        metadata: inputJson(metadata),
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
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) {
    throw DomainError.validation('workspace title must not be empty');
  }
  return normalized;
}
