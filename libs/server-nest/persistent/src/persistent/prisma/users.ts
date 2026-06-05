import { Injectable } from '@nestjs/common';
import { UserWorkspaces, Users } from '@evidence/server-nest-domain';
import { assembleUser } from './mappers';
import { PrismaService } from './prisma.service';
import { PrismaUserWorkspaces } from './user-workspaces';

@Injectable()
export class PrismaUsers implements Users {
  constructor(private readonly prisma: PrismaService) {}

  workspaces(): UserWorkspaces {
    return new PrismaUserWorkspaces(this.prisma, null);
  }

  async findByIdentity(userId: string) {
    const row = await this.prisma.user.findUnique({ where: { id: userId } });
    return row ? assembleUser(this.prisma, row) : null;
  }
}
