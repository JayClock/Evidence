import { describe, expect, it } from 'vitest';
import {
  parseAnalystEvent,
  parseInboxAnalystRequest,
  parseInboxAnalystRuntimeRequest,
  parseKickoffAnalystRequest,
  parseTaskingAnalystRequest,
  parseTaskingAnalystRuntimeRequest,
} from './protocol';

describe('Analyst process protocol', () => {
  it('separates renderer requests from main-process runtime configuration', () => {
    expect(
      parseInboxAnalystRequest({
        id: 'inbox:1',
        workspaceId: 'workspace-1',
        extractionId: 'extraction-1',
      }),
    ).toEqual({
      id: 'inbox:1',
      workspaceId: 'workspace-1',
      extractionId: 'extraction-1',
    });
    expect(
      parseInboxAnalystRuntimeRequest({
        id: 'inbox:1',
        workspaceId: 'workspace-1',
        extractionId: 'extraction-1',
        apiBaseUrl: 'https://evidence.example/api',
      }),
    ).toMatchObject({ apiBaseUrl: 'https://evidence.example/api' });
  });

  it('validates the independent Kickoff request identity', () => {
    expect(
      parseKickoffAnalystRequest({
        id: 'kickoff:1',
        workspaceId: 'workspace-1',
        iterationId: 'iteration-1',
      }),
    ).toEqual({
      id: 'kickoff:1',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
    });
  });

  it('adds local paths only in trusted Tasking runtime configuration', () => {
    const renderer = {
      id: 'tasking:1',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
    };
    expect(parseTaskingAnalystRequest(renderer)).toEqual(renderer);
    expect(
      parseTaskingAnalystRuntimeRequest({
        ...renderer,
        apiBaseUrl: 'https://evidence.example/api',
        sessionDirectory: '/private/tasking-session',
        repositoryRoot: '/private/repository',
        worktreeRoot: '/private/iteration-worktree',
      }),
    ).toMatchObject({
      ...renderer,
      worktreeRoot: '/private/iteration-worktree',
    });
  });

  it('rejects paths and malformed streamed events', () => {
    expect(() =>
      parseInboxAnalystRequest({
        id: 'inbox:1',
        workspaceId: '/Users/private/repository',
        extractionId: 'extraction-1',
      }),
    ).toThrow('unsupported characters');
    expect(
      parseAnalystEvent({
        id: 'inbox:1',
        event: 'complete',
        data: '',
      }),
    ).toEqual({ id: 'inbox:1', event: 'complete', data: '' });
    expect(
      parseAnalystEvent({ id: 'inbox:1', event: 'thinking', data: 'x' }),
    ).toBeNull();
  });
});
