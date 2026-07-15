import {
  BorderedLoader,
  type ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

const NETWORK_STATUS_KEY = 'evidence-network';

type LoadingContext = Pick<ExtensionCommandContext, 'mode' | 'ui'>;

type LoadingResult<T> =
  | { status: 'success'; value: T }
  | { status: 'cancelled' }
  | { status: 'error'; error: unknown };

/** Run one external operation with cancellable TUI feedback and an RPC fallback. */
export async function runWithLoader<T>(
  ctx: LoadingContext,
  message: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T | undefined> {
  if (ctx.mode !== 'tui') {
    const controller = new AbortController();
    ctx.ui.setStatus(NETWORK_STATUS_KEY, message);
    try {
      return await operation(controller.signal);
    } finally {
      ctx.ui.setStatus(NETWORK_STATUS_KEY, undefined);
    }
  }

  const result = await ctx.ui.custom<LoadingResult<T>>(
    (tui, theme, _keybindings, done) => {
      const loader = new BorderedLoader(tui, theme, message, {
        cancellable: true,
      });
      let settled = false;
      const finish = (value: LoadingResult<T>) => {
        if (settled) return;
        settled = true;
        done(value);
      };

      loader.onAbort = () => finish({ status: 'cancelled' });
      void operation(loader.signal).then(
        (value) => finish({ status: 'success', value }),
        (error: unknown) => {
          if (loader.signal.aborted) {
            finish({ status: 'cancelled' });
          } else {
            finish({ status: 'error', error });
          }
        },
      );
      return loader;
    },
  );

  if (!result || result.status === 'cancelled') return undefined;
  if (result.status === 'error') throw result.error;
  return result.value;
}
