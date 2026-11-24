import { setTimeout as pause } from 'node:timers/promises';
import {
  checkWorkspacePath,
  openWorkspace,
} from '@evidence-poc/evidence-model-io';
import {
  loadModel,
  planContextDelivery,
  verifyContextDelivery,
  writeContextDelivery,
} from '@evidence-poc/evidence-api';
import type { CommandContext } from '../context.js';

/** Desktop syncs live edits; the CLI only ever syncs a stable saved source. */
export async function exportContexts(
  root: string,
  { verify, watch }: { verify: boolean; watch: boolean },
  context: CommandContext,
): Promise<number> {
  const read = async () => {
    const workspace = openWorkspace(root);
    const { index, diagnostics } = await loadModel(workspace.model);
    if (!index)
      throw new Error(
        diagnostics
          .map(({ code, message }) => `${code}: ${message}`)
          .join('\n'),
      );
    return index;
  };
  let synced: string | undefined;
  let observed: string | undefined;
  let lastError: string | undefined;
  do {
    try {
      const { modelDigest, document } = await read();
      const stable = !watch || modelDigest === observed;
      observed = modelDigest;
      if (stable && modelDigest !== synced) {
        const plan = await planContextDelivery(document);
        if ((await read()).modelDigest !== modelDigest)
          throw new Error(
            'SOURCE_CHANGED: model changed while projecting API contracts',
          );
        const { root: project, delivery: out, model } = openWorkspace(root);
        checkWorkspacePath(project, out, 'directory');
        if (verify) {
          const stale = verifyContextDelivery(out, plan, model);
          if (stale.length)
            context.stderr(
              stale.map((file) => `OUT_OF_SYNC: ${file}`).join('\n'),
            );
          else
            context.stdout(
              'Context API drafts synchronized (no files written).',
            );
          return stale.length ? 1 : 0;
        }
        const result = writeContextDelivery(out, plan, model);
        context.stdout(
          `Context API drafts: ${result.synced} synced, ${result.blocked} blocked (${result.changedFiles.length} files updated).`,
        );
        synced = modelDigest;
      }
      lastError = undefined;
    } catch (error) {
      if (!watch) throw error;
      observed = undefined;
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastError) context.stderr(message);
      lastError = message;
    }
    if (watch) await pause(500);
  } while (watch);
  return 0;
}
