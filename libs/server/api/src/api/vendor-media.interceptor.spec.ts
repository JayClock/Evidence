import { describe, expect, it } from 'vitest';
import { vendorMediaType } from './vendor-media.interceptor';

describe('vendorMediaType', () => {
  it.each([
    ['/api', 'application/vnd.evidence.root+json'],
    ['/health', 'application/vnd.evidence.health+json'],
    ['/api/users/desktop-user', 'application/vnd.evidence.user+json'],
    [
      '/api/users/desktop-user/memberships',
      'application/vnd.evidence.memberships+json',
    ],
    [
      '/api/users/desktop-user/workspaces',
      'application/vnd.evidence.workspaces+json',
    ],
    [
      '/api/users/desktop-user/workspaces/default-workspace',
      'application/vnd.evidence.workspace+json',
    ],
    [
      '/api/workspaces/default-workspace',
      'application/vnd.evidence.workspace+json',
    ],
    [
      '/api/workspaces/default-workspace/members',
      'application/vnd.evidence.members+json',
    ],
    [
      '/api/workspaces/default-workspace/members/member-1',
      'application/vnd.evidence.member+json',
    ],
    [
      '/api/workspaces/default-workspace/diagram',
      'application/vnd.evidence.diagram+json',
    ],
    [
      '/api/workspaces/default-workspace/diagram/nodes',
      'application/vnd.evidence.nodes+json',
    ],
    [
      '/api/workspaces/default-workspace/diagram/edges/edge-1',
      'application/vnd.evidence.edge+json',
    ],
    [
      '/api/workspaces/default-workspace/logical-entities',
      'application/vnd.evidence.logical-entities+json',
    ],
  ])('maps GET %s to %s', (path, expected) => {
    expect(vendorMediaType('GET', path)).toBe(expected);
  });

  it('maps workspace creation to the singular workspace media type', () => {
    expect(vendorMediaType('POST', '/api/workspaces')).toBe(
      'application/vnd.evidence.workspace+json',
    );
  });

  it('leaves the modeling proposal POST as an event stream', () => {
    expect(
      vendorMediaType(
        'POST',
        '/api/workspaces/default-workspace/diagram/propose-model',
      ),
    ).toBeNull();
  });
});
