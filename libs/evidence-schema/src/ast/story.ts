import { z } from 'zod';
import { DomainIdSchema } from './id.js';
import { JsonObjectSchema } from './json.js';
import { vocabularyIds, vocabularyLabels } from '../vocabulary.js';

const nonEmptyText = z.string().regex(/\S/u, 'must be a non-empty string');
const uniqueTexts = z
  .array(nonEmptyText)
  .refine(
    (values) => new Set(values).size === values.length,
    'must contain unique non-empty strings',
  );

export const StoryTimestampSchema = z
  .string()
  .datetime({ offset: true, message: 'invalid business clock' })
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    'asOf must be an RFC 3339 timestamp with an explicit offset',
  )
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    'invalid business clock',
  );

/** Local step id within a story, or canonical `storyId#stepId` across fork parent chain. */
export const StoryStepIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u);
export const StoryStepRefSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*(?:#[a-z0-9][a-z0-9._-]*)?$/u);

export const STORY_KIND_DEFINITIONS = {
  primary: { label: '主履约故事（Primary）' },
  breach_branch: { label: '违约处置分支（Breach Branch）' },
  negative: { label: '负向拒绝场景（Negative）' },
} as const satisfies Record<string, { readonly label: string }>;

export type StoryKind = keyof typeof STORY_KIND_DEFINITIONS;
export const STORY_KINDS = vocabularyIds(STORY_KIND_DEFINITIONS);
export const STORY_KIND_LABELS = vocabularyLabels(STORY_KIND_DEFINITIONS);
export const StoryKindSchema = z.enum(
  STORY_KINDS as unknown as [StoryKind, ...StoryKind[]],
);

/** Explicit lineage anchor declaring where a branch story diverges from its parent. */
export const StoryForkAnchorSchema = z
  .object({
    storyId: DomainIdSchema,
    stepId: StoryStepIdSchema,
    asOf: StoryTimestampSchema.optional(),
    triggerRuleRef: DomainIdSchema.optional(),
    reason: nonEmptyText.optional(),
  })
  .strict();
export type StoryForkAnchor = z.infer<typeof StoryForkAnchorSchema>;

/** One Domain Storytelling sentence bound to formal evidence facts and HTTP assertions. */
export const StoryStepASTSchema = z
  .object({
    id: StoryStepIdSchema,
    sequence: z.number().int().min(1),
    actorRef: DomainIdSchema,
    activity: nonEmptyText,
    workObjectRef: DomainIdSchema,
    targetActorRef: DomainIdSchema.optional(),
    asOf: StoryTimestampSchema,
    basedOn: z
      .array(StoryStepRefSchema)
      .refine(
        (refs) => new Set(refs).size === refs.length,
        'duplicate step dependency',
      )
      .default([]),
    values: JsonObjectSchema,
    description: nonEmptyText.optional(),
    expectedStatus: z.number().int().min(200).max(599).optional(),
    inputs: JsonObjectSchema.optional(),
    pathParameters: z
      .record(
        z
          .object({
            stepRef: StoryStepRefSchema,
            jsonpath: z.string().startsWith('$'),
          })
          .strict(),
      )
      .optional(),
    expect: JsonObjectSchema.refine(
      (value) => Object.keys(value).every((key) => key.startsWith('$')),
      'expect keys must be JSONPath expressions',
    ).optional(),
  })
  .strict()
  .superRefine((step, ctx) => {
    if (
      step.inputs !== undefined &&
      !(step.expectedStatus !== undefined && step.expectedStatus >= 400)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['inputs'],
        message: 'inputs override is only allowed for explicit negative steps',
      });
    }
  });
export type StoryStepAST = z.infer<typeof StoryStepASTSchema>;

export const DomainStoryASTSchema = z
  .object({
    type: z.literal('story'),
    id: DomainIdSchema,
    title: nonEmptyText,
    kind: StoryKindSchema,
    tags: uniqueTexts.optional(),
    description: nonEmptyText.optional(),
    forkedFrom: StoryForkAnchorSchema.optional(),
    steps: z.array(StoryStepASTSchema).min(1),
    notes: nonEmptyText.optional(),
  })
  .strict()
  .superRefine((story, ctx) => {
    if (story.kind === 'breach_branch' && story.forkedFrom === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['forkedFrom'],
        message: 'a breach_branch story must declare forkedFrom',
      });
    }
    const sequences = new Set<number>();
    const seenStepIds = new Set<string>();
    for (const [index, step] of story.steps.entries()) {
      if (sequences.has(step.sequence))
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'sequence'],
          message: 'duplicate step sequence',
        });
      sequences.add(step.sequence);
      if (seenStepIds.has(step.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'id'],
          message: `duplicate step id '${step.id}' within story '${story.id}'`,
        });
      }
      seenStepIds.add(step.id);
    }
  });
export type DomainStoryAST = z.infer<typeof DomainStoryASTSchema>;
