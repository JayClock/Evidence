import { z } from 'zod';

/** Accept an injected object or a model's JSON text, never executable content. */
export const responseObject = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  return JSON.parse(
    value.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/u, '$1'),
  );
};

const text = z.string().trim().min(1);

export const NarrationSchema = z
  .object({ headline: text.max(180), prose: text.max(600) })
  .strict();

export const HypothesisSchema = z
  .object({
    asOf: z.string().datetime({ offset: true }).optional(),
    values: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.asOf !== undefined || Object.keys(value.values ?? {}).length > 0,
    'The question must identify a concrete clock or input value change.',
  );

export const ImpactExplanationSchema = z
  .object({ businessImpactExplanation: text })
  .strict();

const challengeList = z
  .array(
    z
      .object({
        id: text.max(128),
        category: z.enum([
          'overdue',
          'deficit',
          'condition_gap',
          'actor_mismatch',
        ]),
        label: text.max(100),
        question: text.max(4000),
        targetedRuleId: text.optional(),
        hypothesisDraft: HypothesisSchema.optional(),
      })
      .strict(),
  )
  .max(3);

export const WhatIfChallengesSchema = z
  .object({ challenges: challengeList })
  .strict();

// Authored prose lives in the model. Its cache entry only needs the challenges.
export const StoryDraftSchema = z
  .object({
    narrative: NarrationSchema.optional(),
    challenges: challengeList.optional(),
  })
  .strict()
  .refine(
    (draft) => draft.narrative !== undefined || draft.challenges !== undefined,
  );
