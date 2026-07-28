import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { State, UnderstandingResource } from '@evidence/api-client';
import { UnderstandingDetailView } from './understanding-views';

const sha = (character: string) => `sha256:${character.repeat(64)}`;

afterEach(() => {
  delete window.evidenceDesktop;
});

describe('UnderstandingDetailView', () => {
  it('records the domain expert answer without letting the Analyst answer', async () => {
    const answered = understandingState(understandingData('tqa'));
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(answered);

    renderUnderstanding(
      <UnderstandingDetailView
        resourceState={understandingState(
          understandingData('tqa', { pendingQuestion: true }),
          { post, refresh },
        )}
      />,
    );

    fireEvent.change(screen.getByLabelText('领域专家回答'), {
      target: { value: '共享界面只显示受限状态、计数和哈希。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '记录原文回答' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          expectedIterationVersion: 4,
          answer: '共享界面只显示受限状态、计数和哈希。',
        },
      }),
    );
    expect(
      await screen.findByText('运行下一轮 Requirements Analyst'),
    ).toBeTruthy();
  });

  it('confirms only the selected Drafts with an explicit omission reason', async () => {
    const modeling = understandingState(understandingData('modeling'));
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(modeling);

    renderUnderstanding(
      <UnderstandingDetailView
        resourceState={understandingState(
          understandingData('scenario_review'),
          {
            post,
            refresh,
          },
        )}
      />,
    );

    expect(screen.getAllByText(/Given Story Revision 已锁定/).length).toBe(2);
    expect(screen.queryByText('并发锁定事实')).toBeNull();
    fireEvent.click(screen.getByLabelText('选择 DRAFT-002'));
    fireEvent.change(screen.getByLabelText('省略 Draft 或其他路由的理由'), {
      target: { value: 'DRAFT-002 属于另一条独立业务边界。' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: '确认 1 个 Scenario Draft' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: '确认并追加 Story Revision' }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          expectedIterationVersion: 5,
          action: 'confirm',
          proposalId: 'proposal-1',
          proposalSha256: sha('p'),
          selectedDraftIds: ['draft-1'],
          reason: 'DRAFT-002 属于另一条独立业务边界。',
        },
      }),
    );
    expect(await screen.findByText('只开放显式无模型影响路径')).toBeTruthy();
  });

  it('records the exact no-model-impact authority before opening Tasking', async () => {
    const tasking = understandingState(understandingData('tasking'));
    const post = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(tasking);

    renderUnderstanding(
      <UnderstandingDetailView
        resourceState={understandingState(understandingData('modeling'), {
          post,
          refresh,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('为何此 Story 不需要模型变更'), {
      target: { value: '仅收窄 Desktop 与 Server 的工具传输边界。' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: '记录决定并进入 Tasking' }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        data: {
          expectedIterationVersion: 6,
          storyId: 'story-1',
          storyRevisionId: 'revision-2',
          storyRevisionSha256: sha('s'),
          reason: '仅收窄 Desktop 与 Server 的工具传输边界。',
        },
      }),
    );
    expect(
      (
        await screen.findByRole('link', {
          name: '进入 Tasking / Desk Check',
        })
      ).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/iterations/iteration-1/tasking');
  });
});

function understandingData(
  stage: 'tqa' | 'scenario_review' | 'modeling' | 'tasking',
  { pendingQuestion = false }: { pendingQuestion?: boolean } = {},
): UnderstandingResource['data'] {
  const proposal =
    stage === 'scenario_review'
      ? {
          id: 'proposal-1',
          reference: 'SP-001',
          storyId: 'story-1',
          storyRevisionId: 'revision-1',
          sequence: 1,
          proposedAt: '2026-07-24T11:34:00.000Z',
          contentSha256: sha('p'),
          drafts: [
            scenarioDraft('draft-1', 'DRAFT-001', '保存受限执行事实'),
            scenarioDraft('draft-2', 'DRAFT-002', '恢复本地 Session'),
          ],
        }
      : null;
  const modelingOrLater = stage === 'modeling' || stage === 'tasking';
  return {
    iteration: {
      id: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: 'active',
      loop: stage === 'tasking' ? 'tasking' : 'understand',
      stage: stage === 'tasking' ? 'drafting' : stage,
      version:
        stage === 'tqa'
          ? 4
          : stage === 'scenario_review'
            ? 5
            : stage === 'modeling'
              ? 6
              : 7,
    },
    story: { id: 'story-1', reference: 'US-001' },
    storyRevision: {
      id: modelingOrLater ? 'revision-2' : 'revision-1',
      revisionNumber: modelingOrLater ? 2 : 1,
      contentSha256: modelingOrLater ? sha('s') : sha('r'),
      scenarios: modelingOrLater
        ? [
            {
              id: 'scenario-1',
              reference: 'SC-001',
              title: '保存受限执行事实',
            },
          ]
        : [],
    },
    pendingClarification: pendingQuestion
      ? {
          id: 'question-1',
          reference: 'Q-001',
          storyId: 'story-1',
          storyRevisionId: 'revision-1',
          target: 'business_context',
          question: '共享界面必须显示哪些最小事实？',
          status: 'pending',
          askedAt: '2026-07-24T11:20:00.000Z',
          answer: null,
          answeredByUserId: null,
          answeredAt: null,
          waivedReason: null,
          waivedByUserId: null,
          waivedAt: null,
          contentSha256: sha('q'),
        }
      : null,
    clarifications: [],
    currentScenarioProposal: proposal,
    decisions: [],
  } as unknown as UnderstandingResource['data'];
}

function scenarioDraft(id: string, reference: string, title: string) {
  return {
    id,
    reference,
    position: reference === 'DRAFT-001' ? 0 : 1,
    title,
    given: ['Story Revision 已锁定。'],
    when: '本地 Agent 回报进度。',
    then: ['Server 只保存受限事实。'],
    businessData: ['iterationId', 'storyRevisionSha256'],
    contentSha256: sha(id === 'draft-1' ? '1' : '2'),
  };
}

function understandingState(
  data: UnderstandingResource['data'],
  {
    post = vi.fn(),
    refresh = vi.fn(),
  }: {
    post?: ReturnType<typeof vi.fn>;
    refresh?: ReturnType<typeof vi.fn>;
  } = {},
): State<UnderstandingResource> {
  return {
    data,
    getLink: (relation: string) => {
      const links: Record<string, string> = {
        self: '/api/workspaces/workspace-1/iterations/iteration-1/understanding',
        iteration: '/api/workspaces/workspace-1/iterations/iteration-1',
        story: '/api/workspaces/workspace-1/stories/story-1',
      };
      if (data.pendingClarification) {
        links['answer-question'] =
          `${links.self}/clarifications/question-1/answer`;
        links.decide = `${links.self}/decisions`;
      }
      if (data.currentScenarioProposal)
        links.decide = `${links.self}/decisions`;
      if (data.iteration.stage === 'modeling') {
        links['record-no-model-impact'] = `${links.self}/no-model-impact`;
      }
      if (data.iteration.loop === 'tasking') {
        links.tasking =
          '/api/workspaces/workspace-1/iterations/iteration-1/tasking';
      }
      return links[relation] ? { href: links[relation] } : undefined;
    },
    follow: (relation: string) => ({
      post,
      refresh: relation === 'self' ? refresh : vi.fn(),
    }),
  } as unknown as State<UnderstandingResource>;
}

function renderUnderstanding(view: ReactNode) {
  return render(<MemoryRouter>{view}</MemoryRouter>);
}
