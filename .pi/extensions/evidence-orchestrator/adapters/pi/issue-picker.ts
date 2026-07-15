import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

interface GitHubIssueListItem {
  number: number;
  title: string;
  updatedAt: string;
}

const MAX_ISSUES = 100;
const CREATE_ISSUE_OPTION = '＋ Create a new GitHub Issue';

export type ExternalOperationRunner = <T>(
  message: string,
  operation: (signal?: AbortSignal) => Promise<T>,
) => Promise<T | undefined>;

const runWithoutLoading: ExternalOperationRunner = (_message, operation) =>
  operation(undefined);

function parseIssues(output: string): GitHubIssueListItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('gh issue list returned invalid JSON.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('gh issue list returned an unexpected response.');
  }

  const issues = parsed.filter(
    (item): item is GitHubIssueListItem =>
      typeof item === 'object' &&
      item !== null &&
      Number.isSafeInteger((item as GitHubIssueListItem).number) &&
      (item as GitHubIssueListItem).number > 0 &&
      typeof (item as GitHubIssueListItem).title === 'string' &&
      typeof (item as GitHubIssueListItem).updatedAt === 'string',
  );
  if (issues.length !== parsed.length) {
    throw new Error('gh issue list returned malformed Issue data.');
  }
  return issues;
}

export async function listOpenGitHubIssues(
  pi: Pick<ExtensionAPI, 'exec'>,
  cwd: string,
  signal?: AbortSignal,
): Promise<GitHubIssueListItem[]> {
  const result = await pi.exec(
    'gh',
    [
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      String(MAX_ISSUES),
      '--json',
      'number,title,updatedAt',
    ],
    {
      cwd,
      timeout: 10_000,
      ...(signal ? { signal } : {}),
    },
  );
  if (result.code !== 0) {
    const details = result.stderr.trim() || `exit code ${result.code}`;
    throw new Error(
      `Unable to list GitHub Issues with gh CLI. Authenticate with "gh auth login" and verify repository access. ${details}`,
    );
  }
  return parseIssues(result.stdout);
}

async function createGitHubIssue(
  pi: Pick<ExtensionAPI, 'exec'>,
  ctx: ExtensionCommandContext,
  runExternal: ExternalOperationRunner,
): Promise<number | undefined> {
  const title = await ctx.ui.input(
    'New GitHub Issue title',
    'Describe the requirement briefly',
  );
  if (title === undefined) return undefined;
  if (!title.trim()) throw new Error('GitHub Issue title cannot be empty.');

  const body = await ctx.ui.editor('New GitHub Issue requirement', '');
  if (body === undefined) return undefined;
  if (!body.trim())
    throw new Error('GitHub Issue requirement cannot be empty.');

  return runExternal('正在创建 GitHub Issue…', async (signal) => {
    const result = await pi.exec(
      'gh',
      ['issue', 'create', '--title', title.trim(), '--body', body.trim()],
      {
        cwd: ctx.cwd,
        timeout: 10_000,
        ...(signal ? { signal } : {}),
      },
    );
    if (result.code !== 0) {
      const details = result.stderr.trim() || `exit code ${result.code}`;
      throw new Error(
        `Unable to create the GitHub Issue with gh CLI. ${details}`,
      );
    }

    const issueNumber = Number(result.stdout.match(/\/issues\/(\d+)/)?.[1]);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
      throw new Error(
        'Unable to determine the newly created GitHub Issue number.',
      );
    }
    return issueNumber;
  });
}

export async function selectOrCreateGitHubIssue(
  pi: Pick<ExtensionAPI, 'exec'>,
  ctx: ExtensionCommandContext,
  runExternal: ExternalOperationRunner = runWithoutLoading,
): Promise<number | undefined> {
  if (!ctx.hasUI) {
    throw new Error('/evidence-new requires an interactive mode.');
  }

  const issues = await runExternal('正在加载 GitHub Issues…', (signal) =>
    listOpenGitHubIssues(pi, ctx.cwd, signal),
  );
  if (!issues) return undefined;
  if (issues.length === 0) return createGitHubIssue(pi, ctx, runExternal);

  const options = [
    CREATE_ISSUE_OPTION,
    ...issues.map(
      (issue) =>
        `#${issue.number} ${issue.title} · updated ${issue.updatedAt.slice(0, 10)}`,
    ),
  ];
  const selected = await ctx.ui.select(
    'Select or create a GitHub Issue for the new iteration',
    options,
  );
  if (!selected) return undefined;
  if (selected === CREATE_ISSUE_OPTION)
    return createGitHubIssue(pi, ctx, runExternal);

  const issueNumber = Number(selected.match(/^#(\d+)/)?.[1]);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('The selected GitHub Issue number is invalid.');
  }
  return issueNumber;
}
