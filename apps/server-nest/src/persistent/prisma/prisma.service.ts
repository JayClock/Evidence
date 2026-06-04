import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/evidence',
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.seedDefaults();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  private async seedDefaults(): Promise<void> {
    const timestamp = new Date();
    const userId = 'desktop-user';
    const workspaceId = 'default-workspace';

    await this.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        name: 'Desktop User',
        email: 'desktop@evidence.local',
      },
    });

    await this.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: {
        id: workspaceId,
        title: 'Default Workspace',
        description: 'Seed workspace for local desktop usage',
        status: 'active',
        metadata: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    await this.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      update: {},
      create: {
        id: 'default-workspace-owner',
        workspaceId,
        userId,
        role: 'owner',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
  }
}
