import type { ArtifactStatus } from '@evidence-poc/desktop-contracts/delivery';
import { renderDeliverables } from '@evidence-poc/evidence-acceptance';
import { createSensorsEngine } from '@evidence-poc/evidence-agent';
import {
  ContextDeliveryBlockedError,
  planContextDelivery,
  writeContextDelivery,
} from '@evidence-poc/evidence-api';
import {
  checkWorkspacePath,
  openWorkspace,
} from '@evidence-poc/evidence-model-io';
import type { PersistedModel } from './livePersistence';
import { prepareAcceptanceOutput } from './workspaceAcceptanceOutput';

type Job = {
  snapshot: PersistedModel;
  isCurrent: () => boolean;
  publish: (status: ArtifactStatus) => void;
};

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Projects only verified disk revisions. A slow old plan can never publish over a newer commit. */
export function createArtifactPipeline({
  fingerprint,
  plan = planContextDelivery,
  writeDelivery = writeContextDelivery,
  renderAcceptance = renderDeliverables,
  runSensors = createSensorsEngine().runFullSensors,
}: {
  fingerprint: (rootPath: string) => Promise<string | null>;
  plan?: typeof planContextDelivery;
  writeDelivery?: typeof writeContextDelivery;
  renderAcceptance?: typeof renderDeliverables;
  runSensors?: ReturnType<typeof createSensorsEngine>['runFullSensors'];
}) {
  type Lane = { next?: Job; running?: Promise<void> };
  const lanes = new Map<string, Lane>();

  async function project({ snapshot, isCurrent, publish }: Job) {
    const { rootPath, document, persistenceId, revision, sourceDigest } =
      snapshot;
    let status: ArtifactStatus = {
      persistenceId,
      revision,
      sourceDigest,
      delivery: { kind: 'running' },
      acceptance: { kind: 'running' },
      sensors: { kind: 'running' },
    };
    const update = (change: Partial<ArtifactStatus>) => {
      if (!isCurrent()) return;
      status = { ...status, ...change };
      publish(status);
    };
    const stillOnDisk = async () =>
      isCurrent() &&
      (await fingerprint(rootPath)) === sourceDigest &&
      isCurrent();
    if (!(await stillOnDisk())) return;
    update({});
    let workspace: ReturnType<typeof openWorkspace>;
    try {
      workspace = openWorkspace(rootPath);
    } catch (error) {
      const failed = { kind: 'failed' as const, error: message(error) };
      update({ delivery: failed, acceptance: failed, sensors: failed });
      return;
    }
    const planned = Promise.resolve().then(() => plan(document));
    const delivery = async () => {
      try {
        const projection = await planned;
        if (!(await stillOnDisk())) return;
        checkWorkspacePath(workspace.root, workspace.delivery, 'directory');
        const result = writeDelivery(
          workspace.delivery,
          projection,
          workspace.model,
        );
        update({
          delivery: {
            kind: 'synced',
            directory: result.directory,
            synced: result.synced,
            blocked: result.blocked,
            contexts: projection.contexts.map(
              ({ contextId, status, issues }) => ({
                contextId,
                status: status === 'ready' ? 'synced' : status,
                issues: issues.map(({ message }) => message),
              }),
            ),
          },
        });
      } catch (error) {
        update({
          delivery: {
            kind:
              error instanceof ContextDeliveryBlockedError
                ? 'blocked'
                : 'failed',
            error: message(error),
          },
        });
      }
    };
    const sensors = async () => {
      try {
        const { report } = await runSensors({
          modelRoot: workspace.model,
          document,
        });
        if (await stillOnDisk())
          update({ sensors: { kind: 'checked', report } });
      } catch (error) {
        update({ sensors: { kind: 'failed', error: message(error) } });
      }
    };
    const acceptance = async () => {
      let files: Record<string, string> = {};
      let flows = 0;
      const hasScenarios = document.entities.some(({ examples }) =>
        examples?.some(({ test }) => test !== undefined),
      );
      try {
        const projection = await planned;
        if (projection.contexts.some(({ status }) => status === 'blocked')) {
          update({
            acceptance: {
              kind: 'blocked',
              error: 'API 草稿存在阻断，保留上一次验收产物。',
            },
          });
          return;
        }
        if (!isCurrent()) return;
        if (hasScenarios) {
          const rendered = await renderAcceptance(document, {
            openapi: false,
            tests: true,
          });
          files = rendered.files;
          flows = rendered.flowCount;
        }
      } catch (error) {
        update({ acceptance: { kind: 'blocked', error: message(error) } });
        return;
      }
      try {
        checkWorkspacePath(workspace.root, workspace.acceptance, 'directory');
        const commit = await prepareAcceptanceOutput(
          workspace.acceptance,
          files,
        );
        if (!(await stillOnDisk())) return;
        checkWorkspacePath(workspace.root, workspace.acceptance, 'directory');
        commit();
        update({
          acceptance: flows ? { kind: 'synced', flows } : { kind: 'empty' },
        });
      } catch (error) {
        update({ acceptance: { kind: 'failed', error: message(error) } });
      }
    };
    await Promise.all([delivery(), sensors(), acceptance()]);
  }

  return {
    hasPending: () => lanes.size > 0,
    async drain() {
      while (lanes.size)
        await Promise.all([...lanes.values()].map(({ running }) => running));
    },
    schedule(job: Job) {
      const root = job.snapshot.rootPath;
      const existing = lanes.get(root);
      if (existing) {
        existing.next = job;
        return;
      }
      const lane: Lane = { next: job };
      lanes.set(root, lane);
      lane.running = (async () => {
        try {
          while (lane.next) {
            const job = lane.next;
            delete lane.next;
            await project(job).catch((error: unknown) =>
              console.warn('[artifacts]', error),
            );
          }
        } finally {
          lanes.delete(root);
        }
      })();
    },
  };
}
