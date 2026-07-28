import { describe, expect, it } from 'vitest';
import {
  parseRunShowcaseRequest,
  parseShowcaseControllerEvent,
} from './ipc-protocol';

describe('Showcase IPC protocol', () => {
  it('accepts one bounded request and event', () => {
    expect(
      parseRunShowcaseRequest({
        id: 'request-1',
        workspaceId: 'workspace-1',
        iterationId: 'iteration-1',
      }),
    ).toEqual({
      id: 'request-1',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
    });
    expect(
      parseShowcaseControllerEvent({
        requestId: 'request-1',
        event: 'checkpoint',
        message: 'Q2 evidence recorded.',
        stage: 'setup',
      }),
    ).toEqual({
      requestId: 'request-1',
      event: 'checkpoint',
      message: 'Q2 evidence recorded.',
      stage: 'setup',
    });
  });

  it('rejects malformed stages and renderer-controlled paths', () => {
    expect(
      parseShowcaseControllerEvent({
        requestId: 'request-1',
        event: 'progress',
        message: 'Running.',
        stage: 'pair',
      }),
    ).toBeNull();
    expect(() =>
      parseRunShowcaseRequest({
        id: 'request-1',
        workspaceId: 'workspace-1',
        iterationId: '../outside',
        worktreeRoot: '/tmp/untrusted',
      }),
    ).toThrow(/Iteration id is invalid/);
  });
});
