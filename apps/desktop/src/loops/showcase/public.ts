import type { ShowcaseApiClient } from './api-client';

export type { RemoteShowcase } from './api-client';

/** Read-only Showcase outcome required by the following Respond loop. */
export interface AcceptedShowcaseReader {
  getShowcase: ShowcaseApiClient['getShowcase'];
}
