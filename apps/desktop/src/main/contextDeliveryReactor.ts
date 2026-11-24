import path from 'node:path';
import type { ContextDeliveryStatusEvent } from '@evidence-poc/desktop-contracts/delivery';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  planContextDelivery,
  writeContextDelivery,
} from '@evidence-poc/evidence-api';
import {
  checkWorkspacePath,
  openWorkspace,
} from '@evidence-poc/evidence-model-io';

interface DraftRevision {
  rootPath: string;
  revision: number;
  document: DomainModelDocument;
}
type Publish = (event: ContextDeliveryStatusEvent) => void;

type Lane = {
  rootPath: string;
  project: string;
  source: string;
  revision: number;
  timer?: ReturnType<typeof setTimeout>;
};

/** One latest-revision lane per authorized editor. No IPC write entry point. */
export function createContextDeliveryReactor({
  delay = 500,
  plan = planContextDelivery,
  write = writeContextDelivery,
}: {
  delay?: number;
  plan?: typeof planContextDelivery;
  write?: typeof writeContextDelivery;
} = {}) {
  const lanes = new Map<number, Lane>();
  const owners = new Map<string, number>();
  function cancel(owner: number, rootPath?: string) {
    const lane = lanes.get(owner);
    if (
      !lane ||
      (rootPath !== undefined &&
        path.resolve(lane.rootPath) !== path.resolve(rootPath))
    )
      return;
    clearTimeout(lane.timer);
    lanes.delete(owner);
    owners.delete(lane.source);
  }
  function schedule(owner: number, input: DraftRevision, publish: Publish) {
    const emit = (result: ContextDeliveryStatusEvent['result']) =>
      publish({ rootPath: input.rootPath, revision: input.revision, result });
    const failed = (error: unknown) =>
      emit({
        kind: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    let lane = lanes.get(owner);
    if (lane && lane.rootPath !== input.rootPath) {
      cancel(owner);
      lane = undefined;
    }
    if (!lane) {
      try {
        const { root: project, model: source } = openWorkspace(input.rootPath);
        if (owners.has(source)) throw new Error('另一个窗口正在同步此模型。');
        lane = { rootPath: input.rootPath, project, source, revision: -1 };
        lanes.set(owner, lane);
        owners.set(source, owner);
      } catch (error) {
        failed(error);
        return;
      }
    }
    if (input.revision <= lane.revision) return;
    const active = lane;
    active.revision = input.revision;
    clearTimeout(active.timer);
    const current = () =>
      lanes.get(owner) === active && active.revision === input.revision;
    const run = async () => {
      try {
        const projection = await plan(input.document);
        if (!current()) return;
        const { delivery: directory } = openWorkspace(active.project);
        checkWorkspacePath(active.project, directory, 'directory');
        const { synced, blocked } = write(directory, projection, active.source);
        emit({
          kind: 'synced',
          directory,
          synced,
          blocked,
          contexts: projection.contexts.map(
            ({ contextId, status, issues }) => ({
              contextId,
              status: status === 'ready' ? 'synced' : status,
              issues: issues.map(({ message }) => message),
            }),
          ),
        });
      } catch (error) {
        if (current()) failed(error);
      }
    };
    active.timer = setTimeout(() => void run(), delay);
  }
  return { schedule, cancel };
}
