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

// Check only public prose. The structured hypothesis and result retain exact machine values.
export const whatIfJargon =
  /\b(?:rule[.-][\w.-]+|true|false|CEL|AST|minorUnits)\b|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|最小(?:货币)?单位|(?:模型|沙盘)(?:假设)?推演|仅供参考|未建模|规则集|不(?:代表|构成)[^。！？\n]{0,18}(?:真实(?:付款|支付|发生)|后端操作|实际履约验收)/iu;

export const WhatIfNarrativeText = text
  .min(100)
  .max(150)
  .refine((value) => !whatIfJargon.test(value), '推演解说需使用业务语言。');

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
