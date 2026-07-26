import { describe, expect, it } from 'vitest';
import {
  parseGitHubIssueReference,
  parseReadInboxMarkdownRequest,
  parseStartIterationRequest,
} from './intake-ipc-protocol';

describe('intake IPC protocol', () => {
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

  it('validates structured GitHub Issue references', () => {
    expect(
      parseGitHubIssueReference({
        owner: 'evidence-org',
        repository: 'evidence',
        issueNumber: 42,
      }),
    ).toEqual({
      owner: 'evidence-org',
      repository: 'evidence',
      issueNumber: 42,
    });
    expect(() =>
      parseGitHubIssueReference({
        owner: 'evidence/org',
        repository: 'evidence',
        issueNumber: 42,
      }),
    ).toThrow('unsupported characters');
  });
});
