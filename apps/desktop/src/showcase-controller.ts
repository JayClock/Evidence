import type {
  RecordShowcaseQ2ObservationInput,
  RecordShowcaseReviewInput,
  ShowcaseResourceData,
} from '@evidence/api-client';
import type {
  IterationWorktree,
  IterationWorktreeManager,
} from './capabilities/work-item-worktree/manager';
import type { PairCommandRunner } from './capabilities/command-execution/runner';
import type { RemoteShowcase, ShowcaseApiClient } from './showcase-api-client';
import type {
  ShowcaseReviewerEvent,
  ShowcaseReviewerRuntimeRequest,
} from './showcase-reviewer-protocol';
import type { WorkspaceBindingStore } from './capabilities/workspace-binding/store';

const MAX_Q2_ACTIONS = 100;

type ShowcaseNextAction = NonNullable<ShowcaseResourceData['nextAction']>;
type ShowcaseQ2Action = Extract<ShowcaseNextAction, { kind: 'execute_q2' }>;
type ShowcaseReviewerAction = Extract<
  ShowcaseNextAction,
  { kind: 'run_reviewer' }
>;

export interface RunShowcaseRequest {
  id: string;
  workspaceId: string;
  iterationId: string;
}

export interface ShowcaseControllerEvent {
  requestId: string;
  event: 'progress' | 'checkpoint' | 'human-required';
  message: string;
  stage: ShowcaseResourceData['run']['stage'] | null;
}

export interface ShowcaseControllerSummary {
  iterationId: string;
  showcaseRunId: string;
  stage: ShowcaseResourceData['run']['stage'];
  version: number;
  nextAction: ShowcaseNextAction['kind'] | null;
  evidenceBundleSha256: string | null;
  q2Passed: number;
  q2Total: number;
}

interface BindingReader {
  find(
    apiBaseUrl: string,
    workspaceId: string,
  ): ReturnType<WorkspaceBindingStore['find']>;
}

interface ShowcaseWorktrees {
  locate: IterationWorktreeManager['locate'];
  recover: IterationWorktreeManager['recover'];
  snapshotApproved: IterationWorktreeManager['snapshotApproved'];
}

interface ShowcaseClient {
  getShowcase: ShowcaseApiClient['getShowcase'];
  recordQ2Observation: ShowcaseApiClient['recordQ2Observation'];
  recordReview: ShowcaseApiClient['recordReview'];
}

interface ShowcaseCommands {
  run: PairCommandRunner['run'];
}

interface ShowcaseRuntimeAgent<TRequest, TEvent> {
  run(request: TRequest, onEvent: (event: TEvent) => void): Promise<void>;
  cancel(id: string): Promise<void>;
  stop(): Promise<void>;
}

export interface ShowcaseControllerOptions {
  apiBaseUrl: string;
  bindings: BindingReader;
  worktrees: ShowcaseWorktrees;
  client: ShowcaseClient;
  commands: ShowcaseCommands;
  reviewer: ShowcaseRuntimeAgent<
    ShowcaseReviewerRuntimeRequest,
    ShowcaseReviewerEvent
  >;
}

interface ActiveShowcase {
  workspaceId: string;
  abort: AbortController;
  reviewerRequestId: string | null;
}

export class ShowcaseController {
  private readonly active = new Map<string, ActiveShowcase>();
  private readonly activeWorkspaces = new Set<string>();

  constructor(private readonly options: ShowcaseControllerOptions) {}

  runChecks(
    request: RunShowcaseRequest,
    emit: (event: ShowcaseControllerEvent) => void = () => undefined,
  ): Promise<ShowcaseControllerSummary> {
    return this.exclusive(request, async (abort) => {
      let showcase = await this.options.client.getShowcase(
        request.workspaceId,
        request.iterationId,
        abort.signal,
      );
      const binding = await this.options.bindings.find(
        this.options.apiBaseUrl,
        request.workspaceId,
      );
      if (!binding) {
        throw new Error('The Workspace is not bound to a local repository.');
      }
      const worktree = this.locateWorktree(showcase, binding.repositoryRoot);
      await this.options.worktrees.recover(worktree);

      for (let count = 0; count < MAX_Q2_ACTIONS; count += 1) {
        if (abort.signal.aborted) throw abortError();
        const action = showcase.data.nextAction;
        if (action?.kind !== 'execute_q2') {
          emitEvent(
            emit,
            request.id,
            'human-required',
            nextHumanMessage(showcase),
            showcase.data.run.stage,
          );
          return summary(showcase);
        }
        emitEvent(
          emit,
          request.id,
          'progress',
          `正在重新执行 ${action.testId} · ${action.command}`,
          showcase.data.run.stage,
        );
        showcase = await this.executeQ2(
          showcase,
          action,
          worktree,
          abort.signal,
        );
        emitEvent(
          emit,
          request.id,
          'checkpoint',
          `${action.testId} 的 bounded Q2 观察已记录。`,
          showcase.data.run.stage,
        );
      }
      throw new Error(
        'Showcase Q2 Controller exceeded its bounded action loop.',
      );
    });
  }

  runReviewer(
    request: RunShowcaseRequest,
    emit: (event: ShowcaseControllerEvent) => void = () => undefined,
  ): Promise<ShowcaseControllerSummary> {
    return this.exclusive(request, async (abort) => {
      const showcase = await this.options.client.getShowcase(
        request.workspaceId,
        request.iterationId,
        abort.signal,
      );
      const action = showcase.data.nextAction;
      if (action?.kind !== 'run_reviewer') {
        throw new Error('Showcase is not ready for independent Review.');
      }
      const binding = await this.options.bindings.find(
        this.options.apiBaseUrl,
        request.workspaceId,
      );
      if (!binding) {
        throw new Error('The Workspace is not bound to a local repository.');
      }
      const worktree = this.locateWorktree(showcase, binding.repositoryRoot);
      await this.options.worktrees.recover(worktree);
      const before = await this.options.worktrees.snapshotApproved(
        worktree,
        showcase.data.run.approvedCommitSha,
      );
      const state: {
        completion: Extract<
          ShowcaseReviewerEvent,
          { event: 'complete' }
        > | null;
      } = { completion: null };
      const reviewerRequest = this.reviewerRequest(showcase, action, worktree);
      const active = this.active.get(request.id);
      if (active) active.reviewerRequestId = reviewerRequest.id;
      emitEvent(
        emit,
        request.id,
        'progress',
        '正在运行独立只读 Showcase Reviewer…',
        showcase.data.run.stage,
      );
      await this.options.reviewer.run(reviewerRequest, (event) => {
        if (event.event === 'complete') state.completion = event;
        if (event.event === 'progress') {
          emitEvent(
            emit,
            request.id,
            'progress',
            event.data,
            showcase.data.run.stage,
          );
        }
      });
      if (abort.signal.aborted) throw abortError();
      const after = await this.options.worktrees.snapshotApproved(
        worktree,
        showcase.data.run.approvedCommitSha,
      );
      if (before.worktreeSha256 !== after.worktreeSha256) {
        throw new Error('Showcase Reviewer changed the approved worktree.');
      }
      if (!state.completion) {
        throw new Error('Showcase Reviewer did not return one report.');
      }
      const input: RecordShowcaseReviewInput = {
        expectedShowcaseVersion: action.expectedShowcaseVersion,
        evidenceBundleSha256: action.evidenceBundleSha256,
        observedFacts: state.completion.details.observedFacts,
        productDomainFeedback: state.completion.details.productDomainFeedback,
        technicalQualityFeedback:
          state.completion.details.technicalQualityFeedback,
        unresolvedAssumptions: state.completion.details.unresolvedAssumptions,
        recommendation: state.completion.details.recommendation,
      };
      const reviewed = await this.options.client.recordReview(
        showcase,
        input,
        abort.signal,
      );
      emitEvent(
        emit,
        request.id,
        'human-required',
        '独立 Review 已记录；等待人工价值决定。',
        reviewed.data.run.stage,
      );
      return summary(reviewed);
    });
  }

  cancel(id: string): void {
    const active = this.active.get(id);
    active?.abort.abort();
    if (active?.reviewerRequestId) {
      void this.options.reviewer
        .cancel(active.reviewerRequestId)
        .catch(() => undefined);
    }
  }

  async stop(): Promise<void> {
    for (const active of this.active.values()) active.abort.abort();
    await this.options.reviewer.stop();
  }

  private async executeQ2(
    showcase: RemoteShowcase,
    action: ShowcaseQ2Action,
    worktree: IterationWorktree,
    signal: AbortSignal,
  ): Promise<RemoteShowcase> {
    const before = await this.options.worktrees.snapshotApproved(
      worktree,
      action.approvedCommitSha,
    );
    const result = await this.options.commands.run(action.command, {
      cwd: worktree.worktreeRoot,
      timeoutMs: action.timeoutMs,
      signal,
    });
    const after = await this.options.worktrees.snapshotApproved(
      worktree,
      action.approvedCommitSha,
    );
    if (before.worktreeSha256 !== after.worktreeSha256) {
      throw new Error('A locked Showcase Q2 command changed repository files.');
    }
    const input: RecordShowcaseQ2ObservationInput = {
      showcaseRunId: showcase.data.run.id,
      actionId: action.actionId,
      expectedShowcaseVersion: action.expectedShowcaseVersion,
      command: action.command,
      termination: result.termination,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: result.durationMs,
      stdoutSha256: result.stdoutSha256,
      stdoutBytes: result.stdoutBytes,
      stdoutLines: result.stdoutLines,
      stderrSha256: result.stderrSha256,
      stderrBytes: result.stderrBytes,
      stderrLines: result.stderrLines,
      approvedCommitSha: action.approvedCommitSha,
      worktreeSha256: after.worktreeSha256,
    };
    return this.options.client.recordQ2Observation(showcase, input, signal);
  }

  private reviewerRequest(
    showcase: RemoteShowcase,
    action: ShowcaseReviewerAction,
    worktree: IterationWorktree,
  ): ShowcaseReviewerRuntimeRequest {
    const revision = showcase.data.storyRevision;
    return {
      id: action.actionId,
      timeoutMs: 600_000,
      worktreeRoot: worktree.worktreeRoot,
      evidenceBundleSha256: action.evidenceBundleSha256,
      story: {
        reference: showcase.data.story.reference,
        title: revision.title,
        problem: revision.problem,
        role: revision.role,
        goal: revision.goal,
        value: revision.value,
        scenarios: revision.scenarios.map((scenario) => ({
          reference: scenario.reference,
          title: scenario.title,
          given: scenario.given,
          when: scenario.when,
          then: scenario.then,
          businessData: scenario.businessData,
        })),
      },
      pair: {
        manifestSha256: showcase.data.pairManifest.contentSha256,
        finalDiffSha256: showcase.data.pairManifest.finalDiffSha256,
        approvedCommitSha: showcase.data.run.approvedCommitSha,
        changedPaths: showcase.data.pairManifest.changedPaths,
      },
      q2Observations: showcase.data.q2Observations.map((observation) => ({
        testId: observation.testId,
        scenarioIds: observation.scenarioIds,
        command: observation.command,
        termination: observation.termination,
        exitCode: observation.exitCode,
        recordSha256: observation.recordSha256,
      })),
      productObservations: showcase.data.productObservations.map(
        (observation) => ({
          scenarioReference: observation.scenarioReference,
          observedOutcomes: observation.observedOutcomes,
          observation: observation.observation,
          valueFeedback: observation.valueFeedback,
          evidenceRefs: observation.evidenceRefs,
        }),
      ),
      riskDecisions: showcase.data.riskDecisions.map((decision) => ({
        quadrant: decision.quadrant,
        disposition: decision.disposition,
        activities: decision.activities,
        reason: decision.reason,
      })),
      evaluations: showcase.data.evaluations.map((evaluation) => ({
        quadrant: evaluation.quadrant,
        activity: evaluation.activity,
        outcome: evaluation.outcome,
        finding: evaluation.finding,
        evidenceRefs: evaluation.evidenceRefs,
      })),
    };
  }

  private locateWorktree(
    showcase: RemoteShowcase,
    repositoryRoot: string,
  ): IterationWorktree {
    return this.options.worktrees.locate({
      iterationId: showcase.data.iteration.id,
      repositoryRoot,
      baseCommitSha: showcase.data.pairRun.baseCommitSha,
      branchName: showcase.data.pairRun.branchName,
    });
  }

  private async exclusive<T>(
    request: RunShowcaseRequest,
    operation: (abort: AbortController) => Promise<T>,
  ): Promise<T> {
    if (this.active.has(request.id)) {
      throw new Error(`Showcase request ${request.id} is already active.`);
    }
    if (this.activeWorkspaces.has(request.workspaceId)) {
      throw new Error(
        `Workspace ${request.workspaceId} already has an active Showcase Controller.`,
      );
    }
    const abort = new AbortController();
    this.active.set(request.id, {
      workspaceId: request.workspaceId,
      abort,
      reviewerRequestId: null,
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

function summary(showcase: RemoteShowcase): ShowcaseControllerSummary {
  return {
    iterationId: showcase.data.iteration.id,
    showcaseRunId: showcase.data.run.id,
    stage: showcase.data.run.stage,
    version: showcase.data.run.version,
    nextAction: showcase.data.nextAction?.kind ?? null,
    evidenceBundleSha256: showcase.data.run.evidenceBundleSha256,
    q2Passed: showcase.data.q2Observations.filter(
      ({ termination, exitCode }) => termination === 'exited' && exitCode === 0,
    ).length,
    q2Total: showcase.data.approvedPlan.plan.tests.filter(
      ({ quadrant }) => quadrant === 'Q2',
    ).length,
  };
}

function nextHumanMessage(showcase: RemoteShowcase): string {
  switch (showcase.data.nextAction?.kind) {
    case 'observe_scenario':
      return `Q2 已通过；请人工观察 ${showcase.data.nextAction.scenarioReference} 的产品行为与价值。`;
    case 'decide_risk':
      return `请人工决定 ${showcase.data.nextAction.quadrant} 风险。`;
    case 'evaluate_risk':
      return `请人工评价 ${showcase.data.nextAction.quadrant} / ${showcase.data.nextAction.activity}。`;
    case 'run_reviewer':
      return 'Showcase evidence 已就绪；请运行独立 Reviewer。';
    case 'await_human':
      return '独立 Review 已完成；等待人工价值决定。';
    case 'resolve_failure':
      return 'Q2 未通过；只能人工 revise 或 reject。';
    default:
      return 'Showcase 当前没有本地 Q2 自动动作。';
  }
}

function emitEvent(
  emit: (event: ShowcaseControllerEvent) => void,
  requestId: string,
  event: ShowcaseControllerEvent['event'],
  message: string,
  stage: ShowcaseControllerEvent['stage'],
): void {
  emit({ requestId, event, message, stage });
}

function abortError(): Error {
  const error = new Error('Showcase Controller was cancelled.');
  error.name = 'AbortError';
  return error;
}
