import {
  BorderedLoader,
  type ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import { Box, type Component } from '@earendil-works/pi-tui';
import type { ActivityExecutionDetails } from './execution';
import { renderActivitySubagentResult } from './subagent-renderer';

const ACTIVITY_PROGRESS_KEY = 'evidence-activity-progress';

type ActivityProgressContext = Pick<ExtensionCommandContext, 'mode' | 'ui'>;
type ActivityTheme = Parameters<typeof renderActivitySubagentResult>[2] & {
  bg(color: string, text: string): string;
};

type ActivityLoadingResult =
  | { status: 'success'; value: ActivityExecutionDetails }
  | { status: 'cancelled' }
  | { status: 'error'; error: unknown };

class LiveActivityProgress implements Component {
  private details: ActivityExecutionDetails | undefined;

  constructor(private readonly theme: ActivityTheme) {}

  setDetails(details: ActivityExecutionDetails): void {
    this.details = details;
  }

  render(width: number): string[] {
    if (!this.details) return [];
    const content = renderActivitySubagentResult(
      {
        content: [{ type: 'text', text: this.details.output }],
        details: this.details,
      },
      { expanded: false, isPartial: true, showExpandHint: false },
      this.theme,
    );
    const background = new Box(1, 0, (text) =>
      this.theme.bg('toolPendingBg', text),
    );
    background.addChild(content);
    return background.render(width);
  }

  invalidate(): void {
    return undefined;
  }
}

function progressLines(details: ActivityExecutionDetails): string[] {
  const latest = details.output.trim().split('\n').filter(Boolean).slice(-3);
  return [
    `Evidence ${details.activity} · ${details.agent} · ${details.model}`,
    ...(latest.length > 0 ? latest : ['(running...)']),
  ];
}

/**
 * Keep a command-started activity cancellable while rendering the same child
 * events that tool-started activities expose through partial tool results.
 */
export async function runWithActivityProgress(
  ctx: ActivityProgressContext,
  message: string,
  operation: (
    signal: AbortSignal,
    onUpdate: (details: ActivityExecutionDetails) => void,
  ) => Promise<ActivityExecutionDetails>,
): Promise<ActivityExecutionDetails | undefined> {
  if (ctx.mode !== 'tui') {
    const controller = new AbortController();
    ctx.ui.setStatus(ACTIVITY_PROGRESS_KEY, message);
    ctx.ui.setWidget(ACTIVITY_PROGRESS_KEY, [message]);
    try {
      return await operation(controller.signal, (details) => {
        ctx.ui.setWidget(ACTIVITY_PROGRESS_KEY, progressLines(details));
      });
    } finally {
      ctx.ui.setWidget(ACTIVITY_PROGRESS_KEY, undefined);
      ctx.ui.setStatus(ACTIVITY_PROGRESS_KEY, undefined);
    }
  }

  const result = await ctx.ui.custom<ActivityLoadingResult>(
    (tui, theme, _keybindings, done) => {
      const loader = new BorderedLoader(tui, theme, message, {
        cancellable: true,
      });
      const progress = new LiveActivityProgress(theme);
      let settled = false;

      const finish = (value: ActivityLoadingResult) => {
        if (settled) return;
        settled = true;
        done(value);
      };

      loader.onAbort = () => finish({ status: 'cancelled' });
      void operation(loader.signal, (details) => {
        progress.setDetails(details);
        tui.requestRender();
      }).then(
        (value) => finish({ status: 'success', value }),
        (error: unknown) => {
          if (loader.signal.aborted) {
            finish({ status: 'cancelled' });
          } else {
            finish({ status: 'error', error });
          }
        },
      );

      return {
        render(width: number): string[] {
          const loaderLines = loader.render(width);
          const progressLines = progress.render(width);
          return progressLines.length > 0
            ? [...progressLines, '', ...loaderLines]
            : loaderLines;
        },
        invalidate(): void {
          loader.invalidate();
          progress.invalidate();
        },
        handleInput(data: string): void {
          loader.handleInput(data);
        },
        dispose(): void {
          loader.dispose();
        },
      };
    },
  );

  if (!result || result.status === 'cancelled') return undefined;
  if (result.status === 'error') throw result.error;
  return result.value;
}
