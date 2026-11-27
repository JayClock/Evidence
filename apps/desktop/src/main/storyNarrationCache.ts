import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  checkWorkspacePath,
  openWorkspace,
  workspacePaths,
} from '@evidence-poc/evidence-model-io';
import {
  StoryDraftSchema,
  type StoryDraft,
  type StoryNarrationStore,
} from '@evidence-poc/evidence-agent';

const VERSION = 3;
const ENTRY_LIMIT = 256;
const BYTE_LIMIT = 1024 * 1024;
const validKey = (key: string) => /^[a-f0-9]{64}$/u.test(key);
const readEntries = async (
  file: string,
  signal?: AbortSignal,
): Promise<Map<string, StoryDraft>> => {
  const entries = new Map<string, StoryDraft>();
  try {
    signal?.throwIfAborted();
    const handle = await open(file, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > BYTE_LIMIT) return entries;
      const parsed: unknown = JSON.parse(
        await handle.readFile({ encoding: 'utf8', signal }),
      );
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('version' in parsed) ||
        parsed.version !== VERSION ||
        !('entries' in parsed) ||
        !Array.isArray(parsed.entries) ||
        parsed.entries.length > ENTRY_LIMIT
      )
        return entries;
      for (const item of parsed.entries) {
        if (
          Array.isArray(item) &&
          item.length === 2 &&
          typeof item[0] === 'string' &&
          validKey(item[0])
        ) {
          const parsed = StoryDraftSchema.safeParse(item[1]);
          if (parsed.success) entries.set(item[0], parsed.data);
        }
      }
    } finally {
      await handle.close();
    }
  } catch {
    // A missing, corrupt, or inaccessible cache is never a model failure.
  }
  return entries;
};

/** Disposable drafts local to the selected workspace. */
export const createStoryNarrationCache = () => {
  const writes = new Map<string, Promise<void>>();
  return (rootPath: string): StoryNarrationStore => {
    const { root, cache: directory } = workspacePaths(rootPath);
    const file = path.join(directory, 'narration.json');
    const check = () => {
      openWorkspace(root);
      checkWorkspacePath(root, file, 'file');
    };
    return {
      async read(signal) {
        await writes.get(file)?.catch(() => undefined);
        try {
          check();
        } catch {
          return new Map();
        }
        return readEntries(file, signal);
      },
      write(generated) {
        const save = async () => {
          check();
          const merged = await readEntries(file);
          for (const [key, draft] of generated) {
            const parsed = StoryDraftSchema.safeParse(draft);
            if (!validKey(key) || !parsed.success) continue;
            // A late partial retry in another window must not erase a successful result.
            const combined = { ...merged.get(key), ...parsed.data };
            merged.delete(key);
            merged.set(key, combined);
          }
          // Longer challenge questions can exhaust the byte budget before the entry limit.
          const entries: [string, StoryDraft][] = [];
          let bytes = Buffer.byteLength(
            JSON.stringify({ version: VERSION, entries }),
          );
          for (const entry of [...merged].reverse()) {
            if (entries.length === ENTRY_LIMIT) break;
            const size =
              Buffer.byteLength(JSON.stringify(entry)) +
              Number(entries.length > 0);
            if (bytes + size > BYTE_LIMIT) continue;
            entries.push(entry);
            bytes += size;
          }
          entries.reverse();
          await mkdir(directory, { recursive: true, mode: 0o700 });
          const temp = `${file}.tmp-${randomUUID()}`;
          try {
            await writeFile(
              temp,
              JSON.stringify({ version: VERSION, entries }),
              { flag: 'wx', mode: 0o600 },
            );
            await rename(temp, file);
          } finally {
            await rm(temp, { force: true }).catch(() => undefined);
          }
        };
        // Serialize merges across windows in this desktop process.
        const write = (writes.get(file) ?? Promise.resolve())
          .catch(() => undefined)
          .then(save);
        writes.set(file, write);
        return write.finally(() => {
          if (writes.get(file) === write) writes.delete(file);
        });
      },
    };
  };
};
