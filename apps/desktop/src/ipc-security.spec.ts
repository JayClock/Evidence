import { describe, expect, it } from 'vitest';
import { isTrustedRendererRequest } from './ipc-security';

describe('desktop IPC trust policy', () => {
  it('accepts the expected main renderer frame', () => {
    expect(
      isTrustedRendererRequest({
        senderUrl: 'evidence://app/workspaces/current',
        expectedUrl: 'evidence://app/',
        isMainFrame: true,
      }),
    ).toBe(true);
    expect(
      isTrustedRendererRequest({
        senderUrl: 'http://127.0.0.1:4200/workspaces',
        expectedUrl: 'http://127.0.0.1:4200',
        isMainFrame: true,
      }),
    ).toBe(true);
  });

  it.each([
    {
      senderUrl: 'https://attacker.example/',
      expectedUrl: 'evidence://app/',
      isMainFrame: true,
    },
    {
      senderUrl: 'evidence://app/',
      expectedUrl: 'evidence://app/',
      isMainFrame: false,
    },
    {
      senderUrl: 'file:///tmp/index.html',
      expectedUrl: 'file:///tmp/index.html',
      isMainFrame: true,
    },
  ])('rejects an untrusted request %#', (request) => {
    expect(isTrustedRendererRequest(request)).toBe(false);
  });
});
