import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { ContextDeliveryStatusEvent } from '@evidence-poc/desktop-contracts/delivery';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  contextOutputDirectory,
  planContextDelivery,
  writeContextDelivery,
} from '@evidence-poc/evidence-api';
import { modelSourceOf, projectDirectoryOf } from './modelSource';

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

function configuredDirectory(project: string): string {
  const file = path.join(project, '.evidencerc.json');
  const stat = lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return contextOutputDirectory(project);
  if (!stat.isFile()) throw new Error('.evidencerc.json 必须是普通文件。');
  const config = JSON.parse(readFileSync(file, 'utf8')) as {
    'delivery.outDir'?: unknown;
    delivery?: { outDir?: unknown };
  } | null;
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error('.evidencerc.json 必须是对象。');
  const flat = config['delivery.outDir'];
  const nested = config.delivery?.outDir;
  if (flat !== undefined && nested !== undefined)
    throw new Error('请只声明一个 delivery.outDir。');
  const out = flat === undefined ? nested : flat;
  if (out !== undefined && typeof out !== 'string')
    throw new Error('delivery.outDir 必须是项目内相对路径。');
  return contextOutputDirectory(project, out);
}

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
        const project = realpathSync(projectDirectoryOf(input.rootPath));
        const source = realpathSync(modelSourceOf(input.rootPath));
        const relative = path.relative(project, source);
        if (
          !relative ||
          relative === '..' ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        )
          throw new Error('模型源不在当前项目内。');
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
        const directory = configuredDirectory(active.project);
        const overlaps = (parent: string, child: string) => {
          const relative = path.relative(parent, child);
          return (
            relative !== '..' &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative)
          );
        };
        if (
          overlaps(active.source, directory) ||
          overlaps(directory, active.source)
        )
          throw new Error('API 输出目录与模型源重叠。');
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
