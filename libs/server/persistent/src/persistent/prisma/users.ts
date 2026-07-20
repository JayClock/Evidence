import { Injectable } from '@nestjs/common';
import { UserMemberships, Users, Workspaces } from '@evidence/server-domain';
import { assembleUser } from './mappers';
import { PrismaService } from './prisma.service';
import { PrismaUserMemberships } from './user-memberships';
import { PrismaWorkspaces } from './workspaces';

@Injectable()
export class PrismaUsers implements Users {
  constructor(private readonly prisma: PrismaService) {}

  workspaces(): Workspaces {
    return new PrismaWorkspaces(this.prisma);
  }

  memberships(userId: string): UserMemberships {
    return new PrismaUserMemberships(this.prisma, userId);
  }

  async findByIdentity(userId: string) {
    const row = await this.prisma.user.findUnique({ where: { id: userId } });
    return row ? assembleUser(row) : null;
  }
}
