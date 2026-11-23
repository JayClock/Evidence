import { z } from 'zod';
import { DomainIdSchema } from '../ast/id.js';
import { TerminalRemedyKindSchema } from '../ast/relationship.js';

export const BusinessArchetypeIdSchema = z.enum([
  'matching-escrow',
  'periodic-subscription',
  'back-to-back-consignment',
]);
export type BusinessArchetypeId = z.infer<typeof BusinessArchetypeIdSchema>;

/** Design-time parameters only; not part of the persisted FM document. */
const businessText = z.string().trim().min(1).max(200);
export const InstantiateArchetypeInputSchema = z
  .object({
    archetypeId: BusinessArchetypeIdSchema,
    idPrefix: DomainIdSchema.max(60),
    variationValues: z
      .object({
        subjectLabel: businessText,
        customerLabel: businessText,
        operatorLabel: businessText,
        providerLabel: businessText,
        fulfillmentWindow: businessText.optional(),
        settlementBasis: businessText.optional(),
        billingCycle: businessText.optional(),
        compensation: z
          .object({
            condition: businessText,
            requester: z.enum(['customer', 'operator']),
            requestLabel: businessText,
            confirmationLabel: businessText,
            window: businessText.optional(),
          })
          .strict()
          .optional(),
        remedy: z
          .object({
            kind: TerminalRemedyKindSchema,
            condition: businessText,
            appliesTo: z.enum(['primary', 'compensation']).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
export type InstantiateArchetypeInput = z.infer<
  typeof InstantiateArchetypeInputSchema
>;
