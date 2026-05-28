import createClient from 'openapi-fetch';

import type { paths } from './openapi-schema.js';

export type EvidenceApiPaths = paths;

export function createEvidenceOpenApiClient(baseUrl = '/api') {
  return createClient<paths>({ baseUrl });
}
