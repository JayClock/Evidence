import type {
  RecordShowcaseQ2ObservationInput,
  ShowcaseResourceData,
} from '@evidence/api-client';
import type {
  IterationWorktree,
  IterationWorktreeManager,
} from './iteration-worktree';
import type { PairCommandRunner } from './pair-command-runner';
import type { RemoteShowcase, ShowcaseApiClient } from './showcase-api-client';
import type { WorkspaceBindingStore } from './workspace-binding-store';

const MAX_Q2_ACTIONS = 100;

type ShowcaseNextAction = NonNullable<ShowcaseResourceData['nextAction']>;
type ShowcaseQ2Action = Extract<ShowcaseNextAction, { kind: 'execute_q2' }>;

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
}

interface ShowcaseCommands {
  run: PairCommandRunner['run'];
}

export interface ShowcaseControllerOptions {
  apiBaseUrl: string;
  bindings: BindingReader;
  worktrees: ShowcaseWorktrees;
  client: ShowcaseClient;
  commands: ShowcaseCommands;
}

interface ActiveShowcase {
  workspaceId: string;
  abort: AbortController;
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

  cancel(id: string): void {
    this.active.get(id)?.abort.abort();
  }

  stop(): void {
    for (const active of this.active.values()) active.abort.abort();
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
    this.active.set(request.id, { workspaceId: request.workspaceId, abort });
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
