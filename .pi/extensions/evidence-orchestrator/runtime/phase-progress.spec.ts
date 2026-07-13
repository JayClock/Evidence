import { describe, expect, it, vi } from 'vitest';
import type { PhaseExecutionDetails } from './phase-execution';
import { runWithPhaseProgress } from './phase-progress';

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
  overrides: Partial<PhaseExecutionDetails> = {},
): PhaseExecutionDetails {
  return {
    phase: 'frame',
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

describe('foreground phase progress', () => {
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

    const result = await runWithPhaseProgress(
      {
        mode: 'tui',
        ui: {
          custom,
          setStatus: vi.fn(),
          setWidget: vi.fn(),
        },
      } as never,
      'Running Evidence frame phase…',
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
    expect(renderedDuringRun).toContain('⏳ frame · requirements-analyst');
    expect(renderedDuringRun).toContain(
      'read artifacts/iterations/ITER-0001/issue.json',
    );
    expect(renderedDuringRun).toContain('[toolPendingBg]');
    expect(renderedDuringRun.indexOf('⏳ frame')).toBeLessThan(
      renderedDuringRun.indexOf('Running Evidence frame phase…'),
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
      runWithPhaseProgress(
        {
          mode: 'tui',
          ui: {
            custom,
            setStatus: vi.fn(),
            setWidget: vi.fn(),
          },
        } as never,
        'Running Evidence frame phase…',
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
      runWithPhaseProgress(
        {
          mode: 'rpc',
          ui: { setStatus, setWidget },
        } as never,
        'Running Evidence frame phase…',
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
      'evidence-phase-progress',
      'Running Evidence frame phase…',
    );
    expect(setStatus).toHaveBeenLastCalledWith(
      'evidence-phase-progress',
      undefined,
    );
    expect(setWidget).toHaveBeenCalledWith(
      'evidence-phase-progress',
      expect.arrayContaining([
        'Evidence frame · requirements-analyst · openai-codex/gpt-test',
        'Inspecting the frozen Issue.',
      ]),
    );
    expect(setWidget).toHaveBeenLastCalledWith(
      'evidence-phase-progress',
      undefined,
    );
  });
});
