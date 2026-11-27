import { createHash } from 'node:crypto';
import { compactCanonicalJson } from '@evidence-poc/evidence-schema';
import {
  DST_CHAINED_STORY_PROMPT,
  WHAT_IF_CHALLENGE_SUGGESTION_PROMPT,
} from './prompts.js';
import { NarrationSchema, responseObject } from './responseSchemas.js';
import { abortable, createStoryAgent } from './storyAgent.js';
import {
  storyChallengeContext,
  suggestStoryChallenges,
  type StoryChallengeSource,
} from './storyChallenges.js';
import type {
  StoryAgent,
  StoryNarrativeText,
  StoryScene,
  StoryStepHistoryItem,
  WhatIfChallenge,
} from './types.js';

const STEP_TIMEOUT_MS = 15_000;
const CACHE_LIMIT = 256;

export interface StoryDraft {
  readonly narrative?: StoryNarrativeText;
  readonly challenges?: readonly WhatIfChallenge[];
}

export interface StoryNarrationStore {
  read(signal: AbortSignal): Promise<ReadonlyMap<string, StoryDraft>>;
  write(entries: ReadonlyMap<string, StoryDraft>): Promise<void>;
}

/** Enrich one scene, preserving authored prose and the exact causal context. */
export const createStoryNarrator = ({
  agent = createStoryAgent(),
  store,
}: {
  agent?: StoryAgent;
  store?: StoryNarrationStore;
} = {}) => {
  const cache = new Map<string, StoryDraft>();
  const remember = (key: string, draft: StoryDraft) => {
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
      options: {
        flowId?: string;
        challengeSource?: StoryChallengeSource;
        signal?: AbortSignal;
        cacheOnly?: boolean;
      } = {},
    ): Promise<
      | {
          narrative: StoryNarrativeText;
          challenges?: readonly WhatIfChallenge[];
          cached: boolean;
        }
      | undefined
    > {
      options.signal?.throwIfAborted();
      const context =
        options.challengeSource &&
        storyChallengeContext(options.challengeSource);
      const authored = scene.narrative.status === 'authored';
      if (authored && !context) return undefined;
      const deadline = AbortSignal.timeout(STEP_TIMEOUT_MS);
      const signal = options.signal
        ? AbortSignal.any([options.signal, deadline])
        : deadline;
      const { activity, timing, documentCard, expectation, prerequisites } =
        scene;
      const keyAttributes = documentCard.keyAttributes.map(
        ({ label, value }) => ({ label, value }),
      );
      const story = {
        storyHistory,
        prerequisites,
        currentActivity: {
          stepIndex: scene.stepIndex,
          asOf: timing.displayDate,
          actor: activity.actor.roleLabel,
          recipient: activity.recipient?.roleLabel,
          actionPhrase: activity.actionPhrase,
          fulfillment: activity.fulfillment,
          workObject: activity.workObject.entityLabel,
          referenceCode: activity.workObject.referenceCode,
          rejectedExample: activity.rejectedExample,
          keyAttributes,
        },
        expectation,
      };
      const userPrompt = compactCanonicalJson(story);
      const challengePrompt =
        context &&
        compactCanonicalJson({
          ...story,
          ...context.facts,
          clause: documentCard.clauseRef,
          authoredExplanation: authored ? scene.narrative.prose : undefined,
        });
      const key = createHash('sha256')
        .update(
          JSON.stringify([
            options.flowId,
            scene.stepIndex,
            scene.stepHash,
            DST_CHAINED_STORY_PROMPT,
            userPrompt,
            challengePrompt && WHAT_IF_CHALLENGE_SUGGESTION_PROMPT,
            challengePrompt,
          ]),
        )
        .digest('hex');
      let saved = cache.get(key);
      if (store && (!saved || (context && saved.challenges === undefined))) {
        const entries = await abortable(signal, () =>
          store.read(signal).catch(() => undefined),
        );
        saved = entries?.get(key) ?? saved;
      }
      signal.throwIfAborted();
      if (saved) remember(key, saved);
      const existingProse = authored
        ? { headline: scene.narrative.headline, prose: scene.narrative.prose }
        : saved?.narrative;
      if (
        options.cacheOnly ||
        (existingProse && (!context || saved?.challenges !== undefined))
      ) {
        return saved && existingProse
          ? { ...saved, narrative: existingProse, cached: true }
          : undefined;
      }
      const narrate = async () => {
        const response = await agent.generate({
          systemPrompt: DST_CHAINED_STORY_PROMPT,
          userPrompt,
          signal,
          purpose: 'narration',
        });
        signal.throwIfAborted();
        const draft = NarrationSchema.parse(responseObject(response));
        return activity.fulfillment
          ? { ...draft, headline: scene.narrative.headline }
          : draft;
      };
      const [narrative, challenges] = await Promise.all([
        existingProse ?? abortable(signal, narrate),
        context && challengePrompt
          ? abortable(signal, () =>
              suggestStoryChallenges(agent, challengePrompt, context, signal),
            ).catch(() => undefined)
          : undefined,
      ]);
      // An optional challenge timeout may leave good prose. A cancelled scene may never commit.
      options.signal?.throwIfAborted();
      const draft: StoryDraft = {
        ...(!authored ? { narrative } : {}),
        ...(challenges === undefined ? {} : { challenges }),
      };
      if (draft.narrative || draft.challenges) {
        remember(key, draft);
        if (store)
          void store.write(new Map([[key, draft]])).catch(() => undefined);
      }
      return { ...draft, narrative, cached: false };
    },
  };
};
