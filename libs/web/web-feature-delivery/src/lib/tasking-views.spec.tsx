import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { State, TaskingResource } from '@evidence/api-client';
import { TaskingDetailView } from './tasking-views';

const sha256 = `sha256:${'a'.repeat(64)}`;

function taskingData(
  stage: 'drafting' | 'desk_check' | 'approved' = 'drafting',
) {
  return {
    iteration: {
      id: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: 'active',
      loop: 'tasking',
      stage,
      version: stage === 'drafting' ? 4 : 5,
    },
    story: { id: 'story-1', reference: 'US-001' },
    storyRevision: {
      id: 'revision-2',
      revisionNumber: 2,
      contentSha256: sha256,
    },
    noModelImpactDecision: {
      id: 'no-model-1',
      reference: 'NMI-001',
      reason: 'This Story changes only local workflow glue.',
    },
    currentCandidate:
      stage === 'desk_check'
        ? {
            id: 'tasking-1',
            reference: 'TASKING-001',
            contentSha256: sha256,
            baseCommitSha: 'b'.repeat(40),
            projectCatalogSha256: sha256,
            tests: [
              {
                id: 'TEST-001',
                quadrant: 'Q2',
                stepId: 'electron-package-q2',
                intent: 'The confirmed Scenario reaches Desk Check.',
                scenarioIds: ['SC-001'],
                scenarioOutcome: 'A complete Candidate awaits Desk Check',
              },
            ],
            processes: [
              {
                runtimePlanId: 'RUNTIME-001',
                processId: 'typescript-electron-shell',
                processVersion: 3,
                focusedCommands: [
                  {
                    command:
                      'pnpm nx test @evidence/desktop --run --testNamePattern=tasking',
                  },
                ],
                qualityGates: [
                  { command: 'pnpm nx run @evidence/desktop:package-smoke' },
                ],
              },
            ],
            tasks: [
              {
                id: 'TASK-001',
                description: 'Drive the package outcome.',
                testIds: ['TEST-001'],
                dependsOn: [],
              },
            ],
          }
        : null,
    decisions: [],
    approvedPlan:
      stage === 'approved'
        ? {
            contentSha256: sha256,
          }
        : null,
    processCatalog: [],
  } as unknown as TaskingResource['data'];
}

function taskingState({
  data = taskingData(),
  post = vi.fn(),
  refresh = vi.fn(),
}: {
  data?: TaskingResource['data'];
  post?: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    data,
    getLink: (relation: string) => {
      if (relation === 'iteration') {
        return {
          href: '/api/workspaces/workspace-1/iterations/iteration-1',
        };
      }
      if (relation === 'self') {
        return {
          href: '/api/workspaces/workspace-1/iterations/iteration-1/tasking',
        };
      }
      if (relation === 'decide' && data.iteration.stage === 'desk_check') {
        return {
          href: '/api/workspaces/workspace-1/iterations/iteration-1/tasking/decisions',
        };
      }
      return undefined;
    },
    follow: (relation: string) => ({
      post: relation === 'decide' ? post : vi.fn(),
      refresh: relation === 'self' ? refresh : vi.fn(),
    }),
  } as unknown as State<TaskingResource>;
}

afterEach(() => {
  delete window.evidenceDesktop;
});

describe('TaskingDetailView', () => {
  it('runs the Tasking Analyst only through the Desktop bridge', async () => {
    const refreshed = taskingState({ data: taskingData('desk_check') });
    const refresh = vi.fn().mockResolvedValue(refreshed);
    const runTaskingAnalyst = vi.fn(async () => undefined);
    window.evidenceDesktop = { runTaskingAnalyst } as never;

    render(<TaskingDetailView resourceState={taskingState({ refresh })} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Run local Tasking Analyst' }),
    );

    await waitFor(() =>
      expect(runTaskingAnalyst).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-1',
          iterationId: 'iteration-1',
        }),
        expect.any(Function),
      ),
    );
    expect(await screen.findByText('TASKING-001')).toBeTruthy();
  });

  it('approves the exact Candidate without starting coding', async () => {
    const approved = taskingState({ data: taskingData('approved') });
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(approved);

    render(
      <TaskingDetailView
        resourceState={taskingState({
          data: taskingData('desk_check'),
          post,
          refresh,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve exact plan' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          expectedIterationVersion: 5,
          candidateId: 'tasking-1',
          candidateSha256: sha256,
          action: 'approve',
          reason: null,
        },
      }),
    );
    expect(
      await screen.findByText(
        /plan-confirmed Pair entry; coding has not started/i,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Start local coding/i)).toBeNull();
  });
});
