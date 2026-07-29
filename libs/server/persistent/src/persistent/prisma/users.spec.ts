import { describe, expect, it } from 'vitest';
import type { PrismaService } from './prisma.service';
import { PrismaUsers } from './users';
import {
  asStore,
  mockPrismaStore,
  type MockPrismaStore,
  userRow,
} from './test-support';

function asPrismaService(store: MockPrismaStore): PrismaService {
  return asStore(store) as unknown as PrismaService;
}

describe('PrismaUsers', () => {
  it('loads a user identity', async () => {
    const store = mockPrismaStore();
    store.user.findUnique.mockResolvedValue(userRow());
    const users = new PrismaUsers(asPrismaService(store));

    const user = await users.findByIdentity('user-1');

    expect(user?.identity()).toBe('user-1');
    expect(user?.description()).toEqual({
      name: 'Desktop User',
      email: 'desktop@example.com',
    });
    expect(store.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });

  it('loads a user by its external issuer and subject', async () => {
    const store = mockPrismaStore();
    store.userIdentity.findUnique.mockResolvedValue({ user: userRow() });
    const users = new PrismaUsers(asPrismaService(store));

    const user = await users.findByExternalIdentity({
      issuer: 'https://identity.example.com',
      subject: 'provider-user-1',
    });

    expect(user?.identity()).toBe('user-1');
    expect(store.userIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        issuer_subject: {
          issuer: 'https://identity.example.com',
          subject: 'provider-user-1',
        },
      },
      include: { user: true },
    });
  });

  it('provisions a stable internal user for a new external identity', async () => {
    const store = mockPrismaStore();
    store.user.create.mockResolvedValue(
      userRow({ name: 'Ada Lovelace', email: 'ada@example.com' }),
    );
    const users = new PrismaUsers(asPrismaService(store));

    const user = await users.provisionExternalIdentity({
      issuer: 'https://identity.example.com',
      subject: 'provider-user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });

    expect(user.description()).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(store.user.create).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        identities: {
          create: {
            id: expect.any(String),
            issuer: 'https://identity.example.com',
            subject: 'provider-user-1',
            createdAt: expect.any(Date),
          },
        },
      },
    });
  });

  it('exposes canonical workspaces and user membership projections', () => {
    const store = mockPrismaStore();
    const users = new PrismaUsers(asPrismaService(store));

    expect(users.workspaces()).toBeDefined();
    expect(users.memberships('user-1')).toBeDefined();
  });
});
