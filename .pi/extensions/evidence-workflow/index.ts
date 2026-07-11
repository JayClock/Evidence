import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ensureProjectDirs } from './artifacts';
import { registerCommands } from './commands';
import { readState, writeState } from './state';
import { registerTools } from './tools';

export default function evidenceWorkflowExtension(pi: ExtensionAPI) {
  pi.on('session_start', (_event, ctx) => {
    ensureProjectDirs(ctx.cwd);
    const state = writeState(ctx.cwd, readState(ctx.cwd));
    ctx.ui.setStatus(
      'evidence-workflow',
      `evidence:${state.phase}${state.pending_gate ? ':gate' : ''}`,
    );
  });

  registerCommands(pi);
  registerTools(pi);
}
