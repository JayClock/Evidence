import { describe, expect, it } from 'vitest';
import { User, type UserDescription } from './user';

const userDescription: UserDescription = {
  name: 'Desktop User',
  email: 'desktop@example.com',
};

describe('User', () => {
  it('returns identity and description', () => {
    const user = new User('desktop-user', userDescription);

    expect(user.identity()).toBe('desktop-user');
    expect(user.description()).toBe(userDescription);
  });
});
