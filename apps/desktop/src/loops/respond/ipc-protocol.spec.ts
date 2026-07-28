import { describe, expect, it } from 'vitest';
import {
  parseRespondControllerEvent,
  parseRespondControllerSummary,
  parseRunRespondRequest,
} from './ipc-protocol';

describe('Respond IPC protocol', () => {
  it('accepts bounded controller requests and events', () => {
    expect(
      parseRunRespondRequest({
        id: 'respond-request-1',
        workspaceId: 'workspace-1',
        iterationId: 'iteration-1',
      }),
    ).toEqual({
      id: 'respond-request-1',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
    });
    expect(
      parseRespondControllerEvent({
        requestId: 'respond-request-1',
        event: 'human-required',
        message: 'Awaiting a human decision.',
        stage: 'decision',
      }),
    ).toEqual(expect.objectContaining({ event: 'human-required' }));
  });

  it('validates summaries without exposing local paths or Pi sessions', () => {
    const summary = parseRespondControllerSummary({
      iterationId: 'iteration-1',
      stage: 'decision',
      version: 31,
      nextAction: 'await_human',
      candidateId: 'respond-candidate-1',
      worktreeRoot: '/private/worktree',
      session: { messages: ['private'] },
    });

    expect(summary).toEqual({
      iterationId: 'iteration-1',
      stage: 'decision',
      version: 31,
      nextAction: 'await_human',
      candidateId: 'respond-candidate-1',
    });
  });
});
