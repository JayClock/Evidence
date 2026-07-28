import type {
  ProposeRespondCandidateInput,
  RespondResourceData,
} from '@evidence/api-client';
import type {
  IterationWorktree,
  IterationWorktreeManager,
} from './capabilities/work-item-worktree/manager';
import type { RespondApiClient, RemoteRespond } from './respond-api-client';
import type {
  RespondLearnerEvent,
  RespondLearnerRuntimeRequest,
} from './respond-learner-protocol';
import type { ShowcaseApiClient } from './showcase-api-client';
import type { WorkspaceBindingStore } from './capabilities/workspace-binding/store';

export interface RunRespondRequest {
  id: string;
  workspaceId: string;
  iterationId: string;
}

export interface RespondControllerEvent {
  requestId: string;
  event: 'progress' | 'checkpoint' | 'human-required';
  message: string;
  stage: RespondResourceData['iteration']['stage'];
}

export interface RespondControllerSummary {
  iterationId: string;
  stage: RespondResourceData['iteration']['stage'];
  version: number;
  nextAction: NonNullable<RespondResourceData['nextAction']>['kind'] | null;
  candidateId: string | null;
}

interface RespondControllerOptions {
  apiBaseUrl: string;
  bindings: Pick<WorkspaceBindingStore, 'find'>;
  worktrees: Pick<
    IterationWorktreeManager,
    'locate' | 'recover' | 'snapshotApproved'
  >;
  respond: Pick<RespondApiClient, 'getRespond' | 'proposeCandidate'>;
  showcase: Pick<ShowcaseApiClient, 'getShowcase'>;
  learner: {
    run(
      request: RespondLearnerRuntimeRequest,
      onEvent: (event: RespondLearnerEvent) => void,
    ): Promise<void>;
    cancel(id: string): Promise<void>;
    stop(): Promise<void>;
  };
}

interface ActiveRespond {
  workspaceId: string;
  abort: AbortController;
  learnerRequestId: string | null;
}

type LearnerAction = Extract<
  NonNullable<RespondResourceData['nextAction']>,
  { kind: 'run_learner' }
>;

export class RespondController {
  private readonly active = new Map<string, ActiveRespond>();
  private readonly activeWorkspaces = new Set<string>();

  constructor(private readonly options: RespondControllerOptions) {}

  runLearner(
    request: RunRespondRequest,
    emit: (event: RespondControllerEvent) => void = () => undefined,
  ): Promise<RespondControllerSummary> {
    return this.exclusive(request, async (abort) => {
      const [respond, showcase] = await Promise.all([
        this.options.respond.getRespond(
          request.workspaceId,
          request.iterationId,
          abort.signal,
        ),
        this.options.showcase.getShowcase(
          request.workspaceId,
          request.iterationId,
          abort.signal,
        ),
      ]);
      const action = respond.data.nextAction;
      if (action?.kind !== 'run_learner') {
        throw new Error('Respond is not ready for the local Learner.');
      }
      if (
        action.authoritySha256 !== respond.data.authority.authoritySha256 ||
        action.showcaseRunId !== showcase.data.run.id ||
        showcase.data.run.stage !== 'accepted'
      ) {
        throw new Error('Respond and Showcase authority do not match.');
      }
      const binding = await this.options.bindings.find(
        this.options.apiBaseUrl,
        request.workspaceId,
      );
      if (!binding) {
        throw new Error('The Workspace is not bound to a local repository.');
      }
      const worktree = this.locateWorktree(
        showcase.data.iteration.id,
        showcase.data.pairRun.baseCommitSha,
        showcase.data.pairRun.branchName,
        binding.repositoryRoot,
      );
      await this.options.worktrees.recover(worktree);
      const before = await this.options.worktrees.snapshotApproved(
        worktree,
        showcase.data.run.approvedCommitSha,
      );
      const state: {
        completion: Extract<RespondLearnerEvent, { event: 'complete' }> | null;
      } = { completion: null };
      const learnerRequest = this.learnerRequest(
        respond,
        action,
        showcase.raw,
        showcase.data.pairManifest.changedPaths,
        worktree,
      );
      const active = this.active.get(request.id);
      if (active) active.learnerRequestId = learnerRequest.id;
      emitEvent(
        emit,
        request,
        'progress',
        '正在运行只读 Respond Learner…',
        respond.data.iteration.stage,
      );
      await this.options.learner.run(learnerRequest, (event) => {
        if (event.event === 'complete') state.completion = event;
        if (event.event === 'progress') {
          emitEvent(
            emit,
            request,
            'progress',
            event.data,
            respond.data.iteration.stage,
          );
        }
      });
      if (abort.signal.aborted) throw abortError();
      const after = await this.options.worktrees.snapshotApproved(
        worktree,
        showcase.data.run.approvedCommitSha,
      );
      if (before.worktreeSha256 !== after.worktreeSha256) {
        throw new Error('Respond Learner changed the approved worktree.');
      }
      if (!state.completion) {
        throw new Error('Respond Learner did not return one Candidate.');
      }
      const input: ProposeRespondCandidateInput = {
        actionId: action.actionId,
        expectedIterationVersion: action.expectedIterationVersion,
        authoritySha256: action.authoritySha256,
        promotions: state.completion.details.promotions,
        noPromotionReason: state.completion.details.noPromotionReason,
        observedOutcomes: state.completion.details.observedOutcomes,
        residualRisks: state.completion.details.residualRisks,
        nextProbe: state.completion.details.nextProbe,
      };
      const proposed = await this.options.respond.proposeCandidate(
        respond,
        input,
        abort.signal,
      );
      emitEvent(
        emit,
        request,
        'human-required',
        'Respond Candidate 已记录；等待人工知识决定。',
        proposed.data.iteration.stage,
      );
      return summary(proposed);
    });
  }

  cancel(id: string): void {
    const active = this.active.get(id);
    active?.abort.abort();
    if (active?.learnerRequestId) {
      void this.options.learner
        .cancel(active.learnerRequestId)
        .catch(() => undefined);
    }
  }

  async stop(): Promise<void> {
    for (const active of this.active.values()) active.abort.abort();
    await this.options.learner.stop();
  }

  private learnerRequest(
    respond: RemoteRespond,
    action: LearnerAction,
    showcase: Record<string, unknown>,
    changedPaths: string[],
    worktree: IterationWorktree,
  ): RespondLearnerRuntimeRequest {
    return {
      id: action.actionId,
      timeoutMs: 600_000,
      worktreeRoot: worktree.worktreeRoot,
      authoritySha256: action.authoritySha256,
      approvedCommitSha: respond.data.authority.approvedCommitSha,
      changedPaths,
      evidence: {
        authority: respond.data.authority,
        storyRevision: respond.data.storyRevision,
        acceptedShowcase: showcase,
      },
    };
  }

  private locateWorktree(
    iterationId: string,
    baseCommitSha: string,
    branchName: string,
    repositoryRoot: string,
  ): IterationWorktree {
    return this.options.worktrees.locate({
      iterationId,
      repositoryRoot,
      baseCommitSha,
      branchName,
    });
  }

  private async exclusive<T>(
    request: RunRespondRequest,
    operation: (abort: AbortController) => Promise<T>,
  ): Promise<T> {
    if (this.active.has(request.id)) {
      throw new Error(`Respond request ${request.id} is already active.`);
    }
    if (this.activeWorkspaces.has(request.workspaceId)) {
      throw new Error(
        `Workspace ${request.workspaceId} already has an active Respond Controller.`,
      );
    }
    const abort = new AbortController();
    this.active.set(request.id, {
      workspaceId: request.workspaceId,
      abort,
      learnerRequestId: null,
    });
    this.activeWorkspaces.add(request.workspaceId);
    try {
      return await operation(abort);
    } finally {
      this.active.delete(request.id);
      this.activeWorkspaces.delete(request.workspaceId);
    }
  }
}

function summary(respond: RemoteRespond): RespondControllerSummary {
  return {
    iterationId: respond.data.iteration.id,
    stage: respond.data.iteration.stage,
    version: respond.data.iteration.version,
    nextAction: respond.data.nextAction?.kind ?? null,
    candidateId: respond.data.candidates.at(-1)?.id ?? null,
  };
}

function emitEvent(
  emit: (event: RespondControllerEvent) => void,
  request: RunRespondRequest,
  event: RespondControllerEvent['event'],
  message: string,
  stage: RespondControllerEvent['stage'],
): void {
  emit({ requestId: request.id, event, message, stage });
}

function abortError(): Error {
  const error = new Error('Respond Controller was cancelled.');
  error.name = 'AbortError';
  return error;
}
