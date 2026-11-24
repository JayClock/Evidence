import type {
  LivePersistenceInput,
  PersistenceResult,
  PersistenceState,
  PersistenceStatus,
  WriteProjectResult,
} from '@evidence-poc/desktop-contracts/projects';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

export const PERSISTENCE_DEBOUNCE_MS = 400;

export type PersistedModel = {
  persistenceId: string;
  revision: number;
  rootPath: string;
  sourceDigest: string;
  document: DomainModelDocument;
};

type Options = {
  id: string;
  rootPath: string;
  sourceDigest: string;
  write: (
    document: DomainModelDocument,
    sourceDigest: string,
  ) => Promise<WriteProjectResult>;
  publish: (status: PersistenceStatus) => void;
  committed: (model: PersistedModel) => void;
};

/** A workspace has at most one writer and one waiting snapshot. The queue lives
 * in main so unmounting or closing a renderer cannot cancel a pending debounce. */
export function createLivePersistence({
  id,
  rootPath,
  sourceDigest,
  write,
  publish,
  committed,
}: Options) {
  let revision = 0;
  let writes = 0;
  let pending: LivePersistenceInput | undefined;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failure: string | undefined;
  let conflict: string | undefined;
  let paused = false;
  let disposed = false;
  let latest: PersistenceStatus = {
    persistenceId: id,
    revision: 0,
    kind: 'persisted',
  };

  const emit = (status: PersistenceState & { revision: number }) => {
    if (disposed) return;
    const event = { persistenceId: id, ...status };
    if (event.revision >= latest.revision) latest = event;
    publish(event);
  };
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const start = async () => {
    if (
      !pending ||
      running ||
      timer ||
      paused ||
      disposed ||
      failure ||
      conflict
    )
      return;
    const input = pending;
    pending = undefined;
    ++writes;
    const run = async () => {
      emit({ kind: 'writing', revision: input.revision });
      let result: WriteProjectResult;
      try {
        result = await write(input.document, sourceDigest);
      } catch (error) {
        result = { success: false, error: String(error) };
      }
      if (!result.success || result.sourceDigest === undefined) {
        pending ??= input;
        const error = result.success ? '无法确认磁盘版本。' : result.error;
        if (!result.success && result.conflict) conflict = error;
        else failure = error;
        emit({ kind: conflict ? 'conflict' : 'failed', revision, error });
        return;
      }
      sourceDigest = result.sourceDigest;
      emit({ kind: 'persisted', revision: input.revision });
      if (!disposed)
        committed({
          persistenceId: id,
          revision: input.revision,
          rootPath,
          sourceDigest,
          document: input.document,
        });
    };
    running = run();
    try {
      await running;
    } finally {
      running = undefined;
      void start();
    }
  };
  const arm = () => {
    clearTimer();
    if (paused || disposed || !pending || failure || conflict) return;
    timer = setTimeout(() => {
      timer = undefined;
      void start();
    }, PERSISTENCE_DEBOUNCE_MS);
  };

  return {
    id,
    rootPath,
    status: () => latest,
    hasPending: () => !!(pending || running),
    async matchesDisk(fingerprint: () => Promise<string | null>) {
      while (!disposed) {
        if (running) {
          await running;
          continue;
        }
        const checked = writes;
        const found = await fingerprint();
        if (checked === writes) return found === sourceDigest;
      }
      return true;
    },
    enqueue(input: LivePersistenceInput): PersistenceResult {
      if (
        disposed ||
        paused ||
        input.persistenceId !== id ||
        input.revision <= revision
      )
        return { success: false, error: '当前编辑会话已失效。' };
      revision = input.revision;
      pending = input;
      if (conflict) emit({ kind: 'conflict', revision, error: conflict });
      else if (failure) emit({ kind: 'failed', revision, error: failure });
      else emit({ kind: 'queued', revision });
      arm();
      return { success: true };
    },
    markExternalChange() {
      clearTimer();
      conflict = '磁盘上的模型已变更，请从磁盘重新加载。';
      emit({ kind: 'conflict', revision, error: conflict });
    },
    async flush(): Promise<PersistenceResult> {
      if (paused || disposed)
        return { success: false, error: '正在重新加载模型。' };
      failure = undefined;
      while (pending || running) {
        clearTimer();
        if (running) await running;
        else if (conflict || failure)
          return { success: false, error: conflict ?? failure! };
        else await start();
      }
      return { success: true };
    },
    async pause() {
      paused = true;
      clearTimer();
      await running;
    },
    resume() {
      paused = false;
      arm();
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
