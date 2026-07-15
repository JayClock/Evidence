import { describe, expect, it, vi } from 'vitest';
import type { ActivityExecutionDetails } from './activity-execution';
import { runWithActivityProgress } from './activity-progress';

const theme = {
  fg(_color: string, text: string): string {
    return text;
  },
  bg(color: string, text: string): string {
    return `[${color}]${text}[/${color}]`;
  },
  bold(text: string): string {
    return text;
  },
};

function details(
  overrides: Partial<ActivityExecutionDetails> = {},
): ActivityExecutionDetails {
  return {
    activity: 'kickoff',
    task: 'Frame the frozen requirement.',
    status: 'running',
    agent: 'requirements-analyst',
    model: 'openai-codex/gpt-test',
    thinking: 'medium',
    output: '(running...)',
    messages: [
      {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'read',
            arguments: { path: 'artifacts/iterations/ITER-0001/issue.json' },
          },
        ],
      } as never,
    ],
    exitCode: -1,
    stderr: '',
    ...overrides,
  };
}

describe('foreground activity progress', () => {
  it('renders finalized child events while a TUI command is still running', async () => {
    let component: { render(width: number): string[] } | undefined;
    let renderedDuringRun = '';
    const requestRender = vi.fn(() => {
      renderedDuringRun = component?.render(120).join('\n') ?? '';
    });
    const custom = vi.fn(
      (
        factory: (
          tui: unknown,
          theme: unknown,
          keybindings: unknown,
          done: (value: unknown) => void,
        ) => unknown,
      ) =>
        new Promise((resolve) => {
          component = factory(
            { requestRender },
            theme,
            {},
            resolve,
          ) as typeof component;
        }),
    );

    const result = await runWithActivityProgress(
      {
        mode: 'tui',
        ui: {
          custom,
          setStatus: vi.fn(),
          setWidget: vi.fn(),
        },
      } as never,
      'Running Evidence kickoff activity…',
      async (_signal, onUpdate) => {
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        onUpdate(details());
        return details({
          status: 'completed',
          output: 'Frame complete.',
          exitCode: 0,
        });
      },
    );

    expect(requestRender).toHaveBeenCalled();
    expect(renderedDuringRun).toContain('⏳ kickoff · requirements-analyst');
    expect(renderedDuringRun).toContain(
      'read artifacts/iterations/ITER-0001/issue.json',
    );
    expect(renderedDuringRun).toContain('[toolPendingBg]');
    expect(renderedDuringRun.indexOf('⏳ kickoff')).toBeLessThan(
      renderedDuringRun.indexOf('Running Evidence kickoff activity…'),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        output: 'Frame complete.',
      }),
    );
  });

  it('aborts the child operation when the foreground panel is cancelled', async () => {
    let operationSignal: AbortSignal | undefined;
    const custom = vi.fn(
      (
        factory: (
          tui: unknown,
          theme: unknown,
          keybindings: unknown,
          done: (value: unknown) => void,
        ) => unknown,
      ) =>
        new Promise((resolve) => {
          const component = factory(
            { requestRender: vi.fn() },
            theme,
            {},
            resolve,
          ) as { handleInput(data: string): void };
          queueMicrotask(() => component.handleInput('escape'));
        }),
    );

    await expect(
      runWithActivityProgress(
        {
          mode: 'tui',
          ui: {
            custom,
            setStatus: vi.fn(),
            setWidget: vi.fn(),
          },
        } as never,
        'Running Evidence kickoff activity…',
        (signal) => {
          operationSignal = signal;
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          });
        },
      ),
    ).resolves.toBeUndefined();

    expect(operationSignal?.aborted).toBe(true);
  });

  it('publishes progress through status and widget UI outside TUI mode', async () => {
    const setStatus = vi.fn();
    const setWidget = vi.fn();

    await expect(
      runWithActivityProgress(
        {
          mode: 'rpc',
          ui: { setStatus, setWidget },
        } as never,
        'Running Evidence kickoff activity…',
        async (_signal, onUpdate) => {
          onUpdate(details({ output: 'Inspecting the frozen Issue.' }));
          return details({
            status: 'completed',
            output: 'Frame complete.',
            exitCode: 0,
          });
        },
      ),
    ).resolves.toEqual(expect.objectContaining({ status: 'completed' }));

    expect(setStatus).toHaveBeenNthCalledWith(
      1,
      'evidence-activity-progress',
      'Running Evidence kickoff activity…',
    );
    expect(setStatus).toHaveBeenLastCalledWith(
      'evidence-activity-progress',
      undefined,
    );
    expect(setWidget).toHaveBeenCalledWith(
      'evidence-activity-progress',
      expect.arrayContaining([
        'Evidence kickoff · requirements-analyst · openai-codex/gpt-test',
        'Inspecting the frozen Issue.',
      ]),
    );
    expect(setWidget).toHaveBeenLastCalledWith(
      'evidence-activity-progress',
      undefined,
    );
  });
});
