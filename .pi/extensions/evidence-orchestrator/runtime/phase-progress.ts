import {
  BorderedLoader,
  type ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import { Box, type Component } from '@earendil-works/pi-tui';
import type { PhaseExecutionDetails } from './phase-execution';
import { renderPhaseSubagentResult } from './phase-subagent-renderer';

const PHASE_PROGRESS_KEY = 'evidence-phase-progress';

type PhaseProgressContext = Pick<ExtensionCommandContext, 'mode' | 'ui'>;
type PhaseTheme = Parameters<typeof renderPhaseSubagentResult>[2] & {
  bg(color: string, text: string): string;
};

type PhaseLoadingResult =
  | { status: 'success'; value: PhaseExecutionDetails }
  | { status: 'cancelled' }
  | { status: 'error'; error: unknown };

class LivePhaseProgress implements Component {
  private details: PhaseExecutionDetails | undefined;

  constructor(private readonly theme: PhaseTheme) {}

  setDetails(details: PhaseExecutionDetails): void {
    this.details = details;
  }

  render(width: number): string[] {
    if (!this.details) return [];
    const content = renderPhaseSubagentResult(
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

function progressLines(details: PhaseExecutionDetails): string[] {
  const latest = details.output.trim().split('\n').filter(Boolean).slice(-3);
  return [
    `Evidence ${details.phase} · ${details.agent} · ${details.model}`,
    ...(latest.length > 0 ? latest : ['(running...)']),
  ];
}

/**
 * Keep a command-started phase cancellable while rendering the same finalized
 * child events that tool-started phases expose through partial tool results.
 */
export async function runWithPhaseProgress(
  ctx: PhaseProgressContext,
  message: string,
  operation: (
    signal: AbortSignal,
    onUpdate: (details: PhaseExecutionDetails) => void,
  ) => Promise<PhaseExecutionDetails>,
): Promise<PhaseExecutionDetails | undefined> {
  if (ctx.mode !== 'tui') {
    const controller = new AbortController();
    ctx.ui.setStatus(PHASE_PROGRESS_KEY, message);
    ctx.ui.setWidget(PHASE_PROGRESS_KEY, [message]);
    try {
      return await operation(controller.signal, (details) => {
        ctx.ui.setWidget(PHASE_PROGRESS_KEY, progressLines(details));
      });
    } finally {
      ctx.ui.setWidget(PHASE_PROGRESS_KEY, undefined);
      ctx.ui.setStatus(PHASE_PROGRESS_KEY, undefined);
    }
  }

  const result = await ctx.ui.custom<PhaseLoadingResult>(
    (tui, theme, _keybindings, done) => {
      const loader = new BorderedLoader(tui, theme, message, {
        cancellable: true,
      });
      const progress = new LivePhaseProgress(theme);
      let settled = false;

      const finish = (value: PhaseLoadingResult) => {
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
