import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { GitHubCliAsyncRunner } from '../capabilities/issue-source/github-issue-source';

const GITHUB_CLI_TIMEOUT_MS = 10_000;

/** Adapt Pi's cancellable process execution to the requirement-layer GitHub runner. */
export function createGitHubCliRunner(
  pi: Pick<ExtensionAPI, 'exec'>,
): GitHubCliAsyncRunner {
  return async (args, cwd, signal) => {
    const result = await pi.exec('gh', args, {
      cwd,
      timeout: GITHUB_CLI_TIMEOUT_MS,
      signal,
    });
    if (result.code !== 0) {
      const details = result.stderr.trim() || `exit code ${result.code}`;
      throw new Error(
        `Unable to read the GitHub Issue with gh CLI. Authenticate with "gh auth login" and verify repository access. ${details}`,
      );
    }
    return result.stdout;
  };
}
