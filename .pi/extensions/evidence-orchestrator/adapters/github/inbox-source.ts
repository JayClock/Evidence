import type { CapturedInboxSource } from '../../capabilities/inbox/model';
import type { InboxSourceAdapter } from '../../capabilities/inbox/source';

export type GitHubInboxRunner = (
  args: string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<string>;

export interface GitHubIssueLocator {
  issueNumber: number;
  repository?: string;
}

interface GitHubIssueResponse {
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  author?: { login?: string } | null;
  labels?: Array<{ name?: string }>;
  createdAt: string;
  updatedAt: string;
}

const ISSUE_FIELDS =
  'number,title,body,url,state,author,labels,createdAt,updatedAt';

function parseJson<T>(text: string, description: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${description} returned invalid JSON.`);
  }
}

function requireIssueNumber(issueNumber: number): void {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`Invalid GitHub Issue number: ${issueNumber}.`);
  }
}

export function createGitHubIssueInboxSource(
  runner: GitHubInboxRunner,
): InboxSourceAdapter<GitHubIssueLocator> {
  return {
    kind: 'github_issue',
    async capture(input, cwd, signal): Promise<CapturedInboxSource> {
      requireIssueNumber(input.issueNumber);
      const repository =
        input.repository?.trim() ||
        parseJson<{ nameWithOwner?: string }>(
          await runner(
            ['repo', 'view', '--json', 'nameWithOwner'],
            cwd,
            signal,
          ),
          'gh repo view',
        ).nameWithOwner?.trim();
      if (!repository) {
        throw new Error('Unable to resolve the GitHub repository name.');
      }
      signal?.throwIfAborted();
      const issue = parseJson<GitHubIssueResponse>(
        await runner(
          [
            'issue',
            'view',
            String(input.issueNumber),
            '--repo',
            repository,
            '--json',
            ISSUE_FIELDS,
          ],
          cwd,
          signal,
        ),
        'gh issue view',
      );
      signal?.throwIfAborted();
      if (issue.number !== input.issueNumber) {
        throw new Error(
          `GitHub returned Issue #${issue.number}, expected #${input.issueNumber}.`,
        );
      }
      const labels = (issue.labels ?? [])
        .map(({ name }) => name?.trim())
        .filter((name): name is string => Boolean(name))
        .sort();
      return {
        source_kind: 'github_issue',
        external_key: `github:${repository}#${issue.number}`,
        uri: issue.url,
        title: issue.title,
        body: issue.body?.trim() || '（GitHub Issue 没有正文）',
        content_type: 'text/markdown',
        provider_metadata: {
          repository,
          issue_number: issue.number,
          state: issue.state,
          author: issue.author?.login ?? 'unknown',
          labels,
          created_at: issue.createdAt,
        },
        source_updated_at: issue.updatedAt,
      };
    },
  };
}
