import { readModelRoot } from '@evidence-poc/evidence-model-io';

import { API_FIXTURES } from './fixtures.js';

/** Two payment requests in the same contract can share one confirmation. */
export const sharedConfirmationModel = async () => {
  const { document } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);
  const payment = document.relationships.find(
    ({ id }) => id === 'relation.payment-request-precedes-confirmation',
  )!;
  const paymentRequest = document.relationships.find(
    ({ id }) => id === 'relation.contract-precedes-payment-request',
  )!;
  paymentRequest.sourceCardinality = { min: 0, max: 'many' };
  const balance = 'request.payment-balance';
  document.entities.push({
    ...document.entities.find(({ id }) => id === 'request.payment')!,
    id: balance,
    label: '尾款请求',
  });
  document.relationships.push(
    {
      ...paymentRequest,
      id: 'relation.contract-precedes-payment-balance',
      sourceRef: balance,
      sourceCardinality: { min: 0, max: 1 },
    },
    {
      ...payment,
      id: 'relation.shared-payment',
      targetRef: balance,
    },
  );
  return document;
};
