import { createHash } from 'node:crypto';
import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';
import {
  compactCanonicalJson,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import { STORY_SYSTEM_PROMPT } from './prompts.js';
import { NarrationSchema, responseObject } from './responseSchemas.js';
import { createStoryAgent } from './storyAgent.js';
import type { StoryAgent } from './types.js';

const WORKERS = 3;
const STEP_TIMEOUT_MS = 15_000;
const CACHE_LIMIT = 256;

/** A transport that ignores abort still occupies its slot until it really settles. */
export const createNarrationScheduler = () => {
  let running = 0;
  const queue = new Set<() => void>();
  return <T>(
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> =>
    new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const cancelQueued = () => {
        queue.delete(start);
        reject(signal.reason);
      };
      const start = () => {
        queue.delete(start);
        signal.removeEventListener('abort', cancelQueued);
        running++;
        const active = AbortSignal.any([
          signal,
          AbortSignal.timeout(STEP_TIMEOUT_MS),
        ]);
        const cancelRunning = () => reject(active.reason);
        active.addEventListener('abort', cancelRunning, { once: true });
        void (async () => {
          try {
            active.throwIfAborted();
            resolve(await work(active));
          } catch (error) {
            reject(error);
          } finally {
            active.removeEventListener('abort', cancelRunning);
            running--;
            queue.values().next().value?.();
          }
        })();
      };
      if (running < WORKERS) start();
      else {
        queue.add(start);
        signal.addEventListener('abort', cancelQueued, { once: true });
      }
    });
};

export type StoryNarrationResult = {
  readonly sequence: number;
  readonly stepHash: string;
} & (
  | {
      readonly kind: 'ready';
      readonly narrative: string;
      readonly source: 'ai' | 'cache';
    }
  | { readonly kind: 'failed'; readonly error: Error }
);

/** The desktop may supply an optional project-local cache for disposable drafts. */
export interface StoryNarrationStore {
  read(signal: AbortSignal): Promise<ReadonlyMap<string, string>>;
  write(entries: ReadonlyMap<string, string>): Promise<void>;
}

/** Owns only prose. It cannot change facts, rule evaluations, or the order of playback. */
export const createStoryNarrator = ({
  agent = createStoryAgent(),
  schedule = createNarrationScheduler(),
  store,
}: {
  agent?: StoryAgent;
  schedule?: ReturnType<typeof createNarrationScheduler>;
  store?: StoryNarrationStore;
} = {}) => {
  // Each instance belongs to one project and model configuration, never shared across windows.
  const cache = new Map<string, string>();
  const remember = (key: string, narrative: string) => {
    cache.delete(key);
    cache.set(key, narrative);
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
  };
  return {
    async enrich(
      trace: FlowScenarioTrace,
      model: DomainModelDocument | undefined,
      {
        signal,
        onStep,
        prioritySequence,
        cacheOnly = false,
      }: {
        signal: AbortSignal;
        onStep: (result: StoryNarrationResult) => void;
        prioritySequence?: number;
        cacheOnly?: boolean;
      },
    ): Promise<void> {
      const steps = trace.steps
        .filter((step) => !step.description?.trim())
        .sort((a, b) => a.sequence - b.sequence);
      const priority = steps.findIndex(
        (step) => step.sequence === prioritySequence,
      );
      if (priority > 0) steps.unshift(...steps.splice(priority, 1));
      const entities = new Map(
        model?.entities.map((entity) => [entity.id, entity]),
      );
      const labelOf = (ref: string | undefined) =>
        ref === undefined ? undefined : entities.get(ref)?.label;
      const jobs = steps.map(({ sequence, ...step }) => {
        // Sequence and whole-trace digest must not invalidate unchanged local facts.
        const userPrompt = compactCanonicalJson({
          flowId: trace.flowId,
          flowTitle: trace.flowTitle,
          step: { ...step, description: undefined },
          attributes: entities.get(step.entityId)?.attributes ?? [],
          actingRoleLabel: labelOf(step.actingRoleRef),
          responsibleRoleLabel: labelOf(step.responsibleRoleRef),
          contextLabel: labelOf(step.contextRef),
        });
        const key = createHash('sha256')
          .update(JSON.stringify([1, STORY_SYSTEM_PROMPT, userPrompt]))
          .digest('hex');
        return { sequence, stepHash: step.stepHash, key, userPrompt };
      });
      const cacheMisses = (
        items: typeof jobs,
        entries: ReadonlyMap<string, string>,
      ) =>
        items.filter(({ key, sequence, stepHash }) => {
          if (signal.aborted) return false;
          const narrative = entries.get(key);
          if (narrative === undefined) return true;
          remember(key, narrative);
          onStep({
            kind: 'ready',
            sequence,
            stepHash,
            narrative,
            source: 'cache',
          });
          return false;
        });
      let pending = cacheMisses(jobs, cache);
      if (store && pending.length && !signal.aborted) {
        const saved = await store.read(signal).catch(() => undefined);
        if (saved) pending = cacheMisses(pending, saved);
      }
      if (cacheOnly || signal.aborted) return;
      const generated = new Map<string, string>();
      let index = 0;
      const worker = async () => {
        while (!signal.aborted) {
          const job = pending[index++];
          if (!job) return;
          const { key, userPrompt, sequence, stepHash } = job;
          let result: StoryNarrationResult;
          try {
            const narrative = await schedule(signal, async (stepSignal) => {
              const response = await agent.generate({
                systemPrompt: STORY_SYSTEM_PROMPT,
                userPrompt,
                signal: stepSignal,
                purpose: 'narration',
              });
              stepSignal.throwIfAborted();
              return NarrationSchema.parse(responseObject(response)).narrative;
            });
            if (signal.aborted) return;
            remember(key, narrative);
            if (store) generated.set(key, narrative);
            result = {
              kind: 'ready',
              sequence,
              stepHash,
              narrative,
              source: 'ai',
            };
          } catch (error) {
            if (signal.aborted) return;
            result = {
              kind: 'failed',
              sequence,
              stepHash,
              error: error instanceof Error ? error : new Error(String(error)),
            };
          }
          onStep(result);
        }
      };
      try {
        await Promise.all(
          Array.from({ length: Math.min(WORKERS, pending.length) }, worker),
        );
      } finally {
        // Persist successes even if the user moves on; never store an aborted response.
        if (store && generated.size)
          void store.write(generated).catch(() => undefined);
      }
    },
  };
};
