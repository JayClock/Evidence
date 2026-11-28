import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createModelSession } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { ScenarioStudioModal } from './ScenarioStudioModal';

const setup = () => {
  const model = createDesktopFixture();
  model.stories.push({
    type: 'story',
    id: 'purchase',
    title: '正常购买',
    kind: 'primary',
    steps: [
      {
        id: 'sign',
        sequence: 1,
        actorRef: 'role.buyer',
        activity: '签署',
        workObjectRef: 'evidence.contract',
        asOf: '2026-01-01T00:00:00Z',
        basedOn: [],
        values: { signed_at: '2026-01-01T00:00:00Z' },
      },
    ],
  });
  const session = createModelSession({ document: model });
  const onPlay = vi.fn();
  const onClose = vi.fn();
  return { session, onPlay, onClose };
};

describe('ScenarioStudioModal', () => {
  it('creates an empty scenario and adds a dated business operation to the session', () => {
    const session = createModelSession({ document: createDesktopFixture() });
    render(
      <ScenarioStudioModal
        session={session}
        onPlay={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('新场景名称'), {
      target: { value: '正常签约案例' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建空白场景' }));
    fireEvent.change(screen.getByLabelText('添加业务操作'), {
      target: { value: 'evidence.contract' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加步骤' }));
    fireEvent.change(screen.getByLabelText('业务时刻'), {
      target: { value: '2026-01-01T00:00:00Z' },
    });
    fireEvent.change(screen.getByLabelText('签署时间'), {
      target: { value: '2026-01-01T00:00:00Z' },
    });
    expect(
      session.getDocument().stories.find((s) => s.title === '正常签约案例')!
        .steps[0],
    ).toMatchObject({
      values: { signed_at: '2026-01-01T00:00:00Z' },
    });
  });
  it('clones and edits story steps immediately for the story player', () => {
    const props = setup();
    render(<ScenarioStudioModal {...props} />);
    fireEvent.change(screen.getByLabelText('新场景名称'), {
      target: { value: '合同变更案例' },
    });
    fireEvent.click(screen.getByRole('button', { name: '复制当前场景' }));
    fireEvent.change(screen.getByLabelText('签署时间'), {
      target: { value: '2026-01-02T00:00:00Z' },
    });
    fireEvent.change(screen.getByLabelText('业务时刻'), {
      target: { value: '2026-01-02T00:00:00Z' },
    });
    const cases = props.session
      .getDocument()
      .stories.find((s) => s.title === '合同变更案例')!.steps;
    expect(cases[0].values.signed_at).toBe('2026-01-02T00:00:00Z');
    expect(
      props.session.getDocument().stories.find((s) => s.title === '正常购买')!
        .steps[0].values.signed_at,
    ).toBe('2026-01-01T00:00:00Z');
    fireEvent.click(screen.getByRole('button', { name: '放映当前场景' }));
    expect(props.onPlay).toHaveBeenCalledWith('story-1');
    act(() => {
      expect(props.session.undo()).toBe(true);
    });
    expect(screen.getByLabelText('业务时刻')).toHaveValue(
      '2026-01-01T00:00:00Z',
    );
  });
  it('drops invalid buffer input on a newer revision and never fabricates scenarios', () => {
    const props = setup();
    const view = render(<ScenarioStudioModal {...props} />);
    fireEvent.change(screen.getByLabelText('业务时刻'), {
      target: { value: 'invalid' },
    });
    act(() =>
      props.session.mutate((d) => {
        d.manifest.name = 'new revision';
      }),
    );
    expect(screen.getByLabelText('业务时刻')).toHaveValue(
      '2026-01-01T00:00:00Z',
    );
    view.unmount();
    render(
      <ScenarioStudioModal
        {...props}
        session={createModelSession({ document: createDesktopFixture() })}
      />,
    );
    expect(screen.getByText(/没有自动生成的业务事实/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '放映当前场景' })).toBeDisabled();
  });
  it('keeps incomplete clocks in the form and refuses serialization until fixed', () => {
    const props = setup();
    render(<ScenarioStudioModal {...props} />);
    fireEvent.change(screen.getByLabelText('业务时刻'), {
      target: { value: 'tomorrow' },
    });
    expect(screen.getByRole('button', { name: '放映当前场景' })).toBeDisabled();
    expect(screen.getByLabelText('业务时刻')).toHaveValue('tomorrow');
    expect(
      props.session.getDocument().stories.find((s) => s.title === '正常购买')!
        .steps[0]?.asOf,
    ).toBe('2026-01-01T00:00:00Z');
    fireEvent.click(screen.getByRole('button', { name: '关闭场景工作台' }));
    expect(props.onClose).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('业务时刻'), {
      target: { value: '2026-01-03T00:00:00Z' },
    });
    expect(
      screen.getByRole('button', { name: '放映当前场景' }),
    ).not.toBeDisabled();
    expect(
      props.session.getDocument().stories.find((s) => s.title === '正常购买')!
        .steps[0]?.asOf,
    ).toBe('2026-01-03T00:00:00Z');
  });
});
