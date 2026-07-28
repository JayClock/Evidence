import { describe, expect, it } from 'vitest';
import {
  parseFetchInboxGitHubIssuesRequest,
  parseReadInboxMarkdownRequest,
  parseStartIterationRequest,
} from './flow-ipc-protocol';

describe('flow IPC protocol', () => {
  it('accepts only bounded opaque workflow identities', () => {
    expect(
      parseStartIterationRequest({
        id: 'start:1',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
      }),
    ).toEqual({
      id: 'start:1',
      workspaceId: 'workspace-1',
      candidateId: 'candidate-1',
    });
    expect(() =>
      parseStartIterationRequest({
        id: 'start:1',
        workspaceId: '/Users/private/workspace',
        candidateId: 'candidate-1',
      }),
    ).toThrow('unsupported characters');
  });

  it('keeps Markdown requests repository-relative', () => {
    expect(
      parseReadInboxMarkdownRequest({
        workspaceId: 'workspace-1',
        relativePath: 'docs/request.md',
      }),
    ).toEqual({
      workspaceId: 'workspace-1',
      relativePath: 'docs/request.md',
    });
  });

  it('uses the Workspace binding for bounded GitHub Issue list requests', () => {
    expect(
      parseFetchInboxGitHubIssuesRequest({
        workspaceId: 'workspace-1',
      }),
    ).toEqual({
      workspaceId: 'workspace-1',
    });
    expect(() =>
      parseFetchInboxGitHubIssuesRequest({
        workspaceId: '/Users/private/workspace',
      }),
    ).toThrow('unsupported characters');
  });
});
