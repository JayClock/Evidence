import type {
  DomainModelDocument,
  StoryStepAST,
} from '@evidence-poc/evidence-schema';
import {
  addPaymentFulfillment,
  createProcurementBaseModel,
} from './procurement.js';

export const EXAMPLE_AS_OF = '2026-03-31T10:00:00Z';
/** Full model examples also remain valid OpenAPI request/response documentation. */
export const createAcceptanceModel = (): DomainModelDocument => {
  const model = addPaymentFulfillment(createProcurementBaseModel());
  // Several requests can belong to one agreement: the confirmation must capture requestId.
  model.relationships.find(
    (edge) =>
      edge.sourceRef === 'request.payment' &&
      edge.targetRef === 'contract.agreement',
  )!.sourceCardinality = { min: 0, max: 'many' };
  const step = (
    id: string,
    sequence: number,
    actorRef: string,
    activity: string,
    workObjectRef: string,
    values: Record<string, unknown>,
    basedOn: string[] = [],
  ): StoryStepAST => ({
    id,
    sequence,
    actorRef,
    activity,
    workObjectRef,
    values,
    asOf: EXAMPLE_AS_OF,
    basedOn,
  });
  model.stories.push({
    type: 'story',
    id: 'payment',
    kind: 'primary',
    title: '采购付款',
    steps: [
      step('signed', 1, 'role.buyer', '签署', 'contract.agreement', {
        id: 'agreement-001',
        signed_at: EXAMPLE_AS_OF,
      }),
      step(
        'requested',
        2,
        'role.seller',
        '发起',
        'request.payment',
        {
          id: 'request-001',
          quantity: 10,
          unit_price: 50,
          started_at: EXAMPLE_AS_OF,
          expired_at: '2026-04-01T10:00:00Z',
        },
        ['signed'],
      ),
      step(
        'confirmed',
        3,
        'role.buyer',
        '确认',
        'confirmation.payment',
        {
          id: 'confirmation-001',
          total_amount: 500,
          confirmed_at: EXAMPLE_AS_OF,
        },
        ['requested'],
      ),
    ],
  });
  return model;
};
