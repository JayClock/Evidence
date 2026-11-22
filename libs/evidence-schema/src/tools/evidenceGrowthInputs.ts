import { z } from 'zod';
import {
  AttributeSourceSchema,
  EvidenceStageSchema,
  TimeRoleSchema,
} from '../ast/entity.js';
import { AttributeNameSchema, DomainIdSchema } from '../ast/id.js';
import { TerminalRemedyKindSchema } from '../ast/relationship.js';
import { RuleBindingSchema } from '../ast/rule.js';
import { ValueTypeSchema } from '../ast/values.js';

const named = z
  .object({ id: DomainIdSchema, label: z.string().trim().min(1) })
  .strict();
const attribute = z
  .object({
    name: AttributeNameSchema,
    label: z.string().trim().min(1),
    meaning: z.string().trim().min(1),
  })
  .strict();
const timeName = AttributeNameSchema.regex(
  /_at$/,
  '业务时标字段必须以 _at 结尾',
);
const time = attribute
  .extend({ name: timeName, timeRole: TimeRoleSchema })
  .strict();
const keyData = attribute
  .extend({ valueType: ValueTypeSchema.optional() })
  .strict();
const condition = z.string().trim().min(1);
const confirmation = named
  .extend({
    responsibleRoleRef: DomainIdSchema.optional(),
    occurrence: time.omit({ timeRole: true }).optional(),
    keyData: z.array(keyData).optional(),
  })
  .strict();
const request = named
  .extend({
    responsibleRoleRef: DomainIdSchema.optional(),
    deadlineMeaning: condition.optional(),
  })
  .strict();
const rule = named
  .extend({
    description: condition,
    expression: condition,
    bindings: z.record(RuleBindingSchema),
  })
  .strict();

export const BatchAddEvidenceInputSchema = z
  .object({
    evidences: z
      .array(
        named
          .extend({
            stage: EvidenceStageSchema,
            label: named.shape.label,
            sourceSnippet: condition
              .describe('材料原句或用户确认的事实依据，不填推断。')
              .optional(),
            times: z.array(time).max(2).optional(),
            keyData: z.array(keyData).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const SplitEvidenceToPairInputSchema = z
  .object({
    evidenceRef: DomainIdSchema,
    request: z.discriminatedUnion('mode', [
      request.extend({ mode: z.literal('create') }).strict(),
      z.object({ mode: z.literal('reuse'), ref: DomainIdSchema }).strict(),
    ]),
    fulfillerRoleRef: DomainIdSchema.optional(),
    inputAttributes: z
      .array(
        z
          .object({
            confirmationAttribute: AttributeNameSchema,
            requestAttribute: AttributeNameSchema,
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

const reuse = z
  .object({ mode: z.literal('reuse'), ref: DomainIdSchema })
  .strict();

export const LinkProposalToRfpInputSchema = z
  .object({ proposalRef: DomainIdSchema, rfpRef: DomainIdSchema })
  .strict();

export const IdentifySubjectMatterInputSchema = z
  .object({
    evidenceRefs: z.array(DomainIdSchema).min(1),
    subjectMatter: z.discriminatedUnion('mode', [
      named
        .extend({ mode: z.literal('create'), domainContextRef: DomainIdSchema })
        .strict(),
      reuse,
    ]),
  })
  .strict();

export const BindPartyRoleInputSchema = z
  .object({
    contextRef: DomainIdSchema.describe('合同上下文。'),
    partyRole: z.discriminatedUnion('mode', [
      named.extend({ mode: z.literal('create') }).strict(),
      reuse,
    ]),
    participantRef:
      DomainIdSchema.optional().describe('扮演该角色的现有参与方。'),
    responsibleEvidenceRefs: z
      .array(DomainIdSchema)
      .optional()
      .describe('由此角色发起请求或承担确认责任的凭证。'),
  })
  .strict();

export const BindKeyDataSourceInputSchema = z
  .object({
    evidenceRef: DomainIdSchema,
    attribute: AttributeNameSchema,
    decision: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('unknown') }).strict(),
      z
        .object({ kind: z.literal('direct'), source: AttributeSourceSchema })
        .strict(),
      z
        .object({
          kind: z.literal('derived'),
          rule: rule.extend({ resultType: ValueTypeSchema }).strict(),
        })
        .strict(),
    ]),
  })
  .strict();

export const RecordBreachOutcomeInputSchema = z
  .object({
    requestRef: DomainIdSchema.describe('原履约请求，也可以是既有补偿请求。'),
    condition: condition.describe('经业务确认的违约触发条件。'),
    outcome: z.discriminatedUnion('kind', [
      z
        .object({ kind: z.literal('compensation_pair'), request, confirmation })
        .strict(),
      z
        .object({
          kind: z.literal('terminal_escalation'),
          remedyKind: TerminalRemedyKindSchema,
          handoff: named
            .extend({ responsibleRoleRef: DomainIdSchema.optional() })
            .strict(),
        })
        .strict(),
    ]),
    breachRule: rule.optional(),
  })
  .strict();

export const AssignFulfillmentContextInputSchema = z
  .object({
    requestRef: DomainIdSchema,
    contextRef: DomainIdSchema,
  })
  .strict();

export type BatchAddEvidenceInput = z.infer<typeof BatchAddEvidenceInputSchema>;
export type SplitEvidenceToPairInput = z.infer<
  typeof SplitEvidenceToPairInputSchema
>;
export type LinkProposalToRfpInput = z.infer<
  typeof LinkProposalToRfpInputSchema
>;
export type IdentifySubjectMatterInput = z.infer<
  typeof IdentifySubjectMatterInputSchema
>;
export type BindPartyRoleInput = z.infer<typeof BindPartyRoleInputSchema>;
export type BindKeyDataSourceInput = z.infer<
  typeof BindKeyDataSourceInputSchema
>;
export type RecordBreachOutcomeInput = z.infer<
  typeof RecordBreachOutcomeInputSchema
>;
export type AssignFulfillmentContextInput = z.infer<
  typeof AssignFulfillmentContextInputSchema
>;
