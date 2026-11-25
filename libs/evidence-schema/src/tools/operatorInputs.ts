import { z } from 'zod';
import {
  AttributeASTSchema,
  DomainComponentRoleSchema,
  FulfillmentActionSchema,
} from '../ast/entity.js';
import { CelVariableNameSchema, DomainIdSchema } from '../ast/id.js';
import { RuleBindingSchema } from '../ast/rule.js';
import { ValueTypeSchema } from '../ast/values.js';

/** Operator intentions omit generated times/rules; both agent transports use these. */
const namedObject = z
  .object({ id: DomainIdSchema, label: z.string().min(1) })
  .strict();
const moment = namedObject
  .extend({
    responsibleRoleRef: DomainIdSchema.describe(
      '责任角色 ID，必须是根合同绑定的当事人角色。',
    ),
  })
  .strict();
const request = moment
  .extend({
    fulfillmentAction: FulfillmentActionSchema.optional().describe(
      '义务方应完成的业务动作，例如支付首期款；不是提交请求的动作。',
    ),
    window: z
      .string()
      .min(1)
      .optional()
      .describe('约定履约窗口，例如 7 个工作日。'),
  })
  .strict();
const proof = namedObject
  .extend({
    responsibleRoleRef:
      DomainIdSchema.optional().describe('出具证明的角色，缺省与确认方一致。'),
  })
  .strict();

export const FulfillmentPairIntentSchema = z
  .object({
    contextRef: DomainIdSchema.describe('所属合同上下文 ID。'),
    request,
    confirmation: moment,
    proof: proof.optional(),
  })
  .strict();
export type FulfillmentPairIntent = z.infer<typeof FulfillmentPairIntentSchema>;

export const RoleifyConfirmationIntentSchema = z
  .object({
    targetConfirmationRef: DomainIdSchema,
    providerConfirmationRef:
      DomainIdSchema.describe('另一合同中已有的履约确认。'),
    socket: z.discriminatedUnion('mode', [
      namedObject.extend({ mode: z.literal('create') }).strict(),
      z.object({ mode: z.literal('reuse'), ref: DomainIdSchema }).strict(),
    ]),
  })
  .strict();
export type RoleifyConfirmationIntent = z.infer<
  typeof RoleifyConfirmationIntentSchema
>;

export const DomainCalculatorIntentSchema = z
  .object({
    host: z
      .object({ ref: DomainIdSchema, attribute: AttributeASTSchema })
      .strict(),
    context: namedObject,
    calculator: namedObject
      .extend({
        role: DomainComponentRoleSchema.optional(),
        meaning: z.string().min(1).optional(),
        attributes: z.array(AttributeASTSchema).optional(),
      })
      .strict(),
    rule: namedObject
      .extend({
        description: z.string().min(1),
        expression: z
          .string()
          .min(1)
          .describe('CEL 表达式；组件默认别名 calculator，宿主默认别名 host。'),
        resultType: ValueTypeSchema,
        alias: CelVariableNameSchema.optional(),
      })
      .strict(),
    bindings: z.record(CelVariableNameSchema, RuleBindingSchema).optional(),
    hostAlias: CelVariableNameSchema.optional(),
  })
  .strict();
export type DomainCalculatorIntent = z.infer<
  typeof DomainCalculatorIntentSchema
>;
