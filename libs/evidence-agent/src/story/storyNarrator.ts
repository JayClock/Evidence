import { createHash } from 'node:crypto';
import { compactCanonicalJson } from '@evidence-poc/evidence-schema';
import { DST_CHAINED_STORY_PROMPT } from './prompts.js';
import { NarrationSchema, responseObject } from './responseSchemas.js';
import { createStoryAgent } from './storyAgent.js';
import type {
  StoryAgent,
  StoryNarrativeText,
  StoryScene,
  StoryStepHistoryItem,
} from './types.js';

const STEP_TIMEOUT_MS = 15_000;
const CACHE_LIMIT = 256;

export interface StoryNarrationStore {
  read(signal: AbortSignal): Promise<ReadonlyMap<string, StoryNarrativeText>>;
  write(entries: ReadonlyMap<string, StoryNarrativeText>): Promise<void>;
}

// Return promptly even if a transport ignores cancellation. The worker checks
// the same signal before validating or committing any late response.
const abortable = async <T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> => {
  signal.throwIfAborted();
  let onAbort: () => void = () => undefined;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([cancelled, work()]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

/** Generates only prose for one scene and keys drafts by the exact causal context. */
export const createStoryNarrator = ({
  agent = createStoryAgent(),
  store,
}: {
  agent?: StoryAgent;
  store?: StoryNarrationStore;
} = {}) => {
  const cache = new Map<string, StoryNarrativeText>();
  const remember = (key: string, draft: StoryNarrativeText) => {
    cache.delete(key);
    cache.set(key, draft);
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
  };

  return {
    async enrichStep(
      scene: StoryScene,
      storyHistory: readonly StoryStepHistoryItem[],
      options: { signal?: AbortSignal; cacheOnly?: boolean } = {},
    ): Promise<{ narrative: StoryNarrativeText; cached: boolean } | undefined> {
      options.signal?.throwIfAborted();
      if (scene.narrative.status === 'authored') return undefined;
      const deadline = AbortSignal.timeout(STEP_TIMEOUT_MS);
      const signal = options.signal
        ? AbortSignal.any([options.signal, deadline])
        : deadline;
      const { activity, timing, documentCard, expectation, prerequisites } =
        scene;
      const keyAttributes = documentCard.keyAttributes.map(
        ({ label, value }) => ({ label, value }),
      );
      const userPrompt = compactCanonicalJson({
        storyHistory,
        prerequisites,
        currentActivity: {
          stepIndex: scene.stepIndex,
          asOf: timing.displayDate,
          actor: activity.actor.roleLabel,
          recipient: activity.recipient?.roleLabel,
          actionPhrase: activity.actionPhrase,
          workObject: activity.workObject.entityLabel,
          referenceCode: activity.workObject.referenceCode,
          rejectedExample: activity.rejectedExample,
          keyAttributes,
        },
        expectation,
      });
      const key = createHash('sha256')
        .update(
          JSON.stringify([
            2,
            DST_CHAINED_STORY_PROMPT,
            scene.stepHash,
            userPrompt,
          ]),
        )
        .digest('hex');
      return abortable(signal, async () => {
        const saved =
          cache.get(key) ??
          (await store?.read(signal).catch(() => undefined))?.get(key);
        signal.throwIfAborted();
        if (saved !== undefined) {
          remember(key, saved);
          return { narrative: saved, cached: true };
        }
        if (options.cacheOnly) return undefined;
        const response = await agent.generate({
          systemPrompt: DST_CHAINED_STORY_PROMPT,
          userPrompt,
          signal,
          purpose: 'narration',
        });
        signal.throwIfAborted();
        const narrative = NarrationSchema.parse(responseObject(response));
        remember(key, narrative);
        if (store)
          void store.write(new Map([[key, narrative]])).catch(() => undefined);
        return { narrative, cached: false };
      });
    },
  };
};
