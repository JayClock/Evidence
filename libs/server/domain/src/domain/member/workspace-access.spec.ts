import { describe, expect, it } from 'vitest';
import { workspaceRole, workspaceRoleAllows } from './workspace-access';

describe('workspace access', () => {
  it('normalizes only supported membership roles', () => {
    expect(workspaceRole(' OWNER ')).toBe('owner');
    expect(workspaceRole('', 'member')).toBe('member');
    expect(() => workspaceRole('admin')).toThrow('unsupported workspace role');
  });

  it.each([
    ['owner', 'read', true],
    ['owner', 'write', true],
    ['owner', 'manage', true],
    ['member', 'read', true],
    ['member', 'write', true],
    ['member', 'manage', false],
    ['viewer', 'read', true],
    ['viewer', 'write', false],
    ['viewer', 'manage', false],
    ['legacy-role', 'read', false],
  ] as const)('%s allows %s: %s', (role, permission, allowed) => {
    expect(workspaceRoleAllows(role, permission)).toBe(allowed);
  });
});
