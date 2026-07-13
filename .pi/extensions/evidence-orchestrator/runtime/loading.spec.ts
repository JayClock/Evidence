import { describe, expect, it, vi } from 'vitest';
import { runWithLoader } from './loading';

describe('external operation loading', () => {
  it('shows a cancellable foreground loader in TUI mode', async () => {
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
          factory({}, {}, {}, resolve);
        }),
    );
    const operation = vi.fn(async (signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return 'loaded';
    });

    await expect(
      runWithLoader(
        {
          mode: 'tui',
          ui: { custom, setStatus: vi.fn() },
        } as never,
        '正在加载 GitHub Issues…',
        operation,
      ),
    ).resolves.toBe('loaded');
    expect(custom).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledOnce();
  });

  it('returns undefined when the user cancels the TUI loader', async () => {
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
          const loader = factory({}, {}, {}, resolve) as { abort(): void };
          queueMicrotask(() => loader.abort());
        }),
    );

    await expect(
      runWithLoader(
        {
          mode: 'tui',
          ui: { custom, setStatus: vi.fn() },
        } as never,
        '正在加载…',
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
      ),
    ).resolves.toBeUndefined();
  });

  it('uses a temporary footer status outside TUI mode and always clears it', async () => {
    const setStatus = vi.fn();

    await expect(
      runWithLoader(
        { mode: 'rpc', ui: { setStatus } } as never,
        '正在检查 GitHub Issue…',
        async () => 'current',
      ),
    ).resolves.toBe('current');
    expect(setStatus).toHaveBeenNthCalledWith(
      1,
      'evidence-network',
      '正在检查 GitHub Issue…',
    );
    expect(setStatus).toHaveBeenLastCalledWith('evidence-network', undefined);
  });
});
