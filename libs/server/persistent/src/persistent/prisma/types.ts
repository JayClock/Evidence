import type { Prisma, PrismaClient } from '@prisma/client';

export type PrismaStore = PrismaClient | Prisma.TransactionClient;
