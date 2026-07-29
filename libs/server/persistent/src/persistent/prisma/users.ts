import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type ExternalUserIdentity,
  type ExternalUserIdentityKey,
  UserMemberships,
  Users,
  Workspaces,
} from '@evidence/server-domain';
import { assembleUser } from './mappers';
import { PrismaService } from './prisma.service';
import { PrismaUserMemberships } from './user-memberships';
import { isUniqueConflict } from './utils';
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

  async findByExternalIdentity(identity: ExternalUserIdentityKey) {
    const row = await this.prisma.userIdentity.findUnique({
      where: {
        issuer_subject: {
          issuer: identity.issuer,
          subject: identity.subject,
        },
      },
      include: { user: true },
    });
    return row ? assembleUser(row.user) : null;
  }

  async provisionExternalIdentity(identity: ExternalUserIdentity) {
    try {
      const row = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          name: identity.name,
          email: identity.email,
          identities: {
            create: {
              id: randomUUID(),
              issuer: identity.issuer,
              subject: identity.subject,
              createdAt: new Date(),
            },
          },
        },
      });
      return assembleUser(row);
    } catch (error) {
      if (isUniqueConflict(error)) {
        const existing = await this.findByExternalIdentity(identity);
        if (existing) return existing;
      }
      throw error;
    }
  }
}
