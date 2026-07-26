import type { IterationWorktreeManager } from './iteration-worktree';
import { gitHead } from './git-repository';
import type {
  IntakeApiClient,
  RemoteInboxCandidate,
  RemoteIteration,
} from './intake-api-client';
import type { WorkspaceBindingStore } from './workspace-binding-store';

export interface StartIterationRequest {
  id: string;
  workspaceId: string;
  candidateId: string;
}

export interface IterationProvisioningSummary {
  iterationId: string;
  reference: string;
  lifecycle: RemoteIteration['lifecycle'];
  branchName: string | null;
  baseCommitSha: string;
}

interface BindingReader {
  find(
    apiBaseUrl: string,
    workspaceId: string,
  ): ReturnType<WorkspaceBindingStore['find']>;
}

interface IterationWorktrees {
  prepare: IterationWorktreeManager['prepare'];
}

interface IterationClient {
  getCandidate: IntakeApiClient['getCandidate'];
  selectCandidate: IntakeApiClient['selectCandidate'];
  completeProvisioning: IntakeApiClient['completeProvisioning'];
  failProvisioning: IntakeApiClient['failProvisioning'];
}

export class IterationController {
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly apiBaseUrl: string,
    private readonly bindings: BindingReader,
    private readonly worktrees: IterationWorktrees,
    private readonly client: IterationClient,
    private readonly resolveGitHead: typeof gitHead = gitHead,
  ) {}

  async start(
    request: StartIterationRequest,
  ): Promise<IterationProvisioningSummary> {
    if (this.active.has(request.id)) {
      throw new Error(`Iteration request ${request.id} is already running.`);
    }
    const abort = new AbortController();
    this.active.set(request.id, abort);
    try {
      const binding = await this.bindings.find(
        this.apiBaseUrl,
        request.workspaceId,
      );
      if (!binding) {
        throw new Error(
          'The Workspace must be bound to a local Git repository before starting an Iteration.',
        );
      }
      const [candidate, baseCommitSha] = await Promise.all([
        this.client.getCandidate(
          request.workspaceId,
          request.candidateId,
          abort.signal,
        ),
        this.resolveGitHead(binding.repositoryRoot),
      ]);
      assertReadyCandidate(candidate);
      const iteration = await this.client.selectCandidate(
        candidate,
        baseCommitSha,
        abort.signal,
      );

      try {
        const worktree = await this.worktrees.prepare({
          iterationId: iteration.id,
          repositoryRoot: binding.repositoryRoot,
          baseCommitSha: iteration.baseCommitSha,
          signal: abort.signal,
        });
        const active = await this.client.completeProvisioning(
          iteration,
          worktree.branchName,
          abort.signal,
        );
        return summary(active);
      } catch (error) {
        await this.client
          .failProvisioning(
            iteration,
            'Desktop could not create the isolated Iteration worktree.',
            abort.signal,
          )
          .catch(() => undefined);
        throw error;
      }
    } finally {
      if (this.active.get(request.id) === abort) {
        this.active.delete(request.id);
      }
    }
  }

  cancel(id: string): void {
    this.active.get(id)?.abort();
  }

  stop(): void {
    for (const abort of this.active.values()) abort.abort();
  }
}

function assertReadyCandidate(candidate: RemoteInboxCandidate): void {
  if (candidate.status !== 'ready') {
    throw new Error(
      `Inbox Candidate ${candidate.reference} is ${candidate.status} and cannot start an Iteration.`,
    );
  }
}

function summary(iteration: RemoteIteration): IterationProvisioningSummary {
  return {
    iterationId: iteration.id,
    reference: iteration.reference,
    lifecycle: iteration.lifecycle,
    branchName: iteration.branchName,
    baseCommitSha: iteration.baseCommitSha,
  };
}
