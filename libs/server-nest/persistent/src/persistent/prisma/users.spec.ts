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
  it('loads a user with a persistent workspace association', async () => {
    const store = mockPrismaStore();
    store.user.findUnique.mockResolvedValue(userRow());
    const users = new PrismaUsers(asPrismaService(store));

    const user = await users.findByIdentity('user-1');

    expect(user?.identity()).toBe('user-1');
    expect(user?.description()).toEqual({
      name: 'Desktop User',
      email: 'desktop@example.com',
    });
    expect(user?.workspaces()).toBeDefined();
    expect(store.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });

  it('exposes the unscoped workspace association from the users collection', () => {
    const store = mockPrismaStore();
    const users = new PrismaUsers(asPrismaService(store));

    expect(users.workspaces()).toBeDefined();
  });
});
