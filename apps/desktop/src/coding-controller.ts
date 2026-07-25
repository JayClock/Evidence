import type {
  CodingAgentEvent,
  CodingAgentRuntimeRequest,
} from './coding-agent-protocol';
import type {
  CodingRunDecisionRequest,
  CodingRunEvent,
  CodingRunRejectionRequest,
  StartCodingRequest,
} from './coding-ipc-protocol';
import {
  CodingQualityGateRunner,
  type CodingQualityCheck,
} from './coding-quality-gates';
import {
  CodingRunClient,
  type RemoteCodingRunResource,
} from './coding-run-client';
import {
  CodingWorktreeManager,
  type CodingDiff,
  type CodingWorktree,
} from './coding-worktree';
import { gitHead } from './git-repository';
import type { LocalAgent } from './local-agent';
import type {
  WorkspaceBinding,
  WorkspaceBindingStore,
} from './workspace-binding-store';

interface ActiveCodingRun {
  request: StartCodingRequest;
  emit: (event: CodingRunEvent) => void;
  abort: AbortController;
  cancelled: boolean;
  remoteRun: RemoteCodingRunResource | null;
  worktree: CodingWorktree | null;
}

interface ReviewedCodingRun {
  workspaceId: string;
  remoteRun: RemoteCodingRunResource;
  worktree: CodingWorktree;
  diff: CodingDiff;
  commitSha: string | null;
}

export interface LocalCodingReview {
  run: Record<string, unknown>;
  diff: string;
  diffSha256: string;
  changedFileCount: number;
}

export class CodingController {
  private readonly active = new Map<string, ActiveCodingRun>();
  private readonly reviewed = new Map<string, ReviewedCodingRun>();

  constructor(
    private readonly apiBaseUrl: string,
    private readonly bindings: Pick<WorkspaceBindingStore, 'find'>,
    private readonly worktrees: CodingWorktreeManager,
    private readonly client: CodingRunClient,
    private readonly agent: Pick<
      LocalAgent<CodingAgentRuntimeRequest, CodingAgentEvent>,
      'run' | 'cancel' | 'stop'
    >,
    private readonly qualityGates = new CodingQualityGateRunner(),
  ) {}

  async run(
    request: StartCodingRequest,
    emit: (event: CodingRunEvent) => void,
  ): Promise<void> {
    if (this.active.has(request.id)) {
      throw new Error(`Coding request ${request.id} is already running.`);
    }
    const active: ActiveCodingRun = {
      request,
      emit,
      abort: new AbortController(),
      cancelled: false,
      remoteRun: null,
      worktree: null,
    };
    this.active.set(request.id, active);

    try {
      const binding = await this.requireBinding(request.workspaceId);
      const [baseCommitSha, story, revision] = await Promise.all([
        gitHead(binding.repositoryRoot),
        this.client.getStory(
          request.workspaceId,
          request.storyId,
          active.abort.signal,
        ),
        this.client.getStoryRevision(
          request.workspaceId,
          request.storyId,
          request.storyRevisionId,
          active.abort.signal,
        ),
      ]);
      this.assertNotCancelled(active);
      if (
        story.latestRevisionId !== request.storyRevisionId ||
        story.latestScenarioCount === 0
      ) {
        throw new CodingExecutionError(
          'story-revision-not-ready',
          'The selected Story Revision is not the latest Scenario-bearing revision.',
        );
      }

      active.remoteRun = await this.client.start(
        story,
        { storyRevisionId: request.storyRevisionId, baseCommitSha },
        active.abort.signal,
      );
      emitEvent(active, 'run-started', { run: active.remoteRun.raw });
      this.assertNotCancelled(active);

      active.worktree = await this.worktrees.prepare({
        runId: active.remoteRun.id,
        repositoryRoot: binding.repositoryRoot,
        baseCommitSha,
        signal: active.abort.signal,
      });
      this.assertNotCancelled(active);
      const qualityGateScripts = await this.qualityGates.lock(
        active.worktree.worktreeRoot,
      );

      await this.agent.run(
        {
          id: request.id,
          runId: active.remoteRun.id,
          worktreeRoot: active.worktree.worktreeRoot,
          qualityGateScripts,
          storyRevision: revision,
        },
        (event) => {
          emit({
            ...event,
            event: event.event === 'complete' ? 'agent-complete' : event.event,
          });
        },
      );
      this.assertNotCancelled(active);

      const diff = await this.worktrees.inspect(active.worktree);
      if (diff.changedFileCount === 0) {
        throw new CodingExecutionError(
          'no-changes',
          'The local Coding Agent completed without a reviewable change.',
        );
      }
      emitEvent(active, 'diff-ready', {
        diff: diff.content,
        diffSha256: diff.sha256,
        changedFileCount: diff.changedFileCount,
      });

      const checks = await this.qualityGates.run(
        active.worktree.worktreeRoot,
        qualityGateScripts,
        active.abort.signal,
        (check) => emitEvent(active, 'quality-check', check),
      );
      this.assertNotCancelled(active);
      if (checks.some((check) => check.status === 'failed')) {
        throw new CodingExecutionError(
          'quality-gate',
          'One or more local quality gates failed.',
        );
      }
      if (!checks.some((check) => check.status === 'passed')) {
        throw new CodingExecutionError(
          'quality-gates-unavailable',
          'The repository does not expose any supported quality gate.',
        );
      }

      active.remoteRun = await this.client.submitForReview(
        active.remoteRun,
        {
          diffSha256: diff.sha256,
          changedFileCount: diff.changedFileCount,
          qualityChecks: checks.map(serverQualityCheck),
        },
        active.abort.signal,
      );
      this.reviewed.set(active.remoteRun.id, {
        workspaceId: request.workspaceId,
        remoteRun: active.remoteRun,
        worktree: active.worktree,
        diff,
        commitSha: null,
      });
      emitEvent(active, 'review-ready', {
        run: active.remoteRun.raw,
        diff: diff.content,
        diffSha256: diff.sha256,
        changedFileCount: diff.changedFileCount,
      });
      emitEvent(active, 'complete', '');
    } catch (error) {
      if (active.cancelled) return;
      await this.failAndClean(active, error);
      emitEvent(active, 'controller-error', errorMessage(error));
      throw error;
    } finally {
      if (this.active.get(request.id) === active) {
        this.active.delete(request.id);
      }
    }
  }

  async cancel(requestId: string): Promise<void> {
    const active = this.active.get(requestId);
    if (!active || active.cancelled) return;
    active.cancelled = true;
    active.abort.abort();
    await this.agent.cancel(requestId);
    if (active.remoteRun?.status === 'running') {
      active.remoteRun = await this.client
        .cancel(active.remoteRun)
        .catch(() => active.remoteRun);
    }
    if (active.worktree) {
      await this.worktrees
        .remove(active.worktree, { deleteBranch: true })
        .catch(() => undefined);
    }
    emitEvent(active, 'cancelled', {
      run: active.remoteRun?.raw ?? null,
    });
    emitEvent(active, 'complete', '');
  }

  getReview(runId: string): LocalCodingReview | null {
    const review = this.reviewed.get(runId);
    return review
      ? {
          run: review.remoteRun.raw,
          diff: review.diff.content,
          diffSha256: review.diff.sha256,
          changedFileCount: review.diff.changedFileCount,
        }
      : null;
  }

  async accept(
    input: CodingRunDecisionRequest,
  ): Promise<Record<string, unknown>> {
    const review = this.requireReview(input);
    if (!review.commitSha) {
      review.commitSha = await this.worktrees.commit(
        review.worktree,
        review.diff.sha256,
        commitMessage(review.remoteRun.storyRevisionId),
      );
    }
    review.remoteRun = await this.client.accept(
      review.remoteRun,
      review.diff.sha256,
      review.commitSha,
    );
    await this.worktrees.remove(review.worktree, { deleteBranch: false });
    this.reviewed.delete(review.remoteRun.id);
    return review.remoteRun.raw;
  }

  async reject(
    input: CodingRunRejectionRequest,
  ): Promise<Record<string, unknown>> {
    const review = this.requireReview(input);
    review.remoteRun = await this.client.reject(review.remoteRun, input.reason);
    await this.worktrees.remove(review.worktree, { deleteBranch: true });
    this.reviewed.delete(review.remoteRun.id);
    return review.remoteRun.raw;
  }

  async stop(): Promise<void> {
    await Promise.all([...this.active.keys()].map((id) => this.cancel(id)));
    await this.agent.stop();
  }

  private requireReview(input: CodingRunDecisionRequest): ReviewedCodingRun {
    const review = this.reviewed.get(input.runId);
    if (
      !review ||
      review.workspaceId !== input.workspaceId ||
      review.diff.sha256 !== input.diffSha256
    ) {
      throw new Error('Local Coding Run review is unavailable or has changed.');
    }
    return review;
  }

  private async requireBinding(workspaceId: string): Promise<WorkspaceBinding> {
    const binding = await this.bindings.find(this.apiBaseUrl, workspaceId);
    if (!binding) {
      throw new Error('Bind this Workspace to a local Git repository first.');
    }
    return binding;
  }

  private assertNotCancelled(active: ActiveCodingRun): void {
    if (active.cancelled) throw new Error('Coding Run was cancelled.');
  }

  private async failAndClean(
    active: ActiveCodingRun,
    error: unknown,
  ): Promise<void> {
    if (active.remoteRun?.status === 'running') {
      const failure = executionFailure(error);
      active.remoteRun = await this.client
        .fail(active.remoteRun, failure.code, failure.summary)
        .catch(() => active.remoteRun);
    }
    if (active.worktree) {
      await this.worktrees
        .remove(active.worktree, { deleteBranch: true })
        .catch(() => undefined);
    }
    emitEvent(active, 'run-failed', { run: active.remoteRun?.raw ?? null });
  }
}

class CodingExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CodingExecutionError';
  }
}

function executionFailure(error: unknown): { code: string; summary: string } {
  if (error instanceof CodingExecutionError) {
    return { code: error.code, summary: error.message };
  }
  return {
    code: 'local-execution',
    summary: 'Local coding execution failed. See the Desktop event log.',
  };
}

function serverQualityCheck(check: CodingQualityCheck): CodingQualityCheck {
  return {
    ...check,
    summary:
      check.status === 'passed'
        ? 'Gate passed.'
        : check.status === 'skipped'
          ? 'Gate was not available or was not required.'
          : 'Gate failed. See Desktop logs.',
  };
}

function commitMessage(storyRevisionId: string): string {
  return `feat(workspace): implement story revision ${storyRevisionId.slice(0, 32)}`;
}

function emitEvent(
  active: ActiveCodingRun,
  event: string,
  data: unknown,
): void {
  active.emit({
    id: active.request.id,
    event,
    data: typeof data === 'string' ? data : JSON.stringify(data),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
