const VENDOR_PREFIX = 'application/vnd.evidence';

export const resourceContentTypes = {
  root: `${VENDOR_PREFIX}.root+json`,
  health: `${VENDOR_PREFIX}.health+json`,
  user: `${VENDOR_PREFIX}.user+json`,
  sidebar: `${VENDOR_PREFIX}.sidebar+json`,
  workspace: `${VENDOR_PREFIX}.workspace+json`,
  membership: `${VENDOR_PREFIX}.membership+json`,
  memberships: `${VENDOR_PREFIX}.memberships+json`,
  inboxItem: `${VENDOR_PREFIX}.inbox-item+json`,
  inboxItems: `${VENDOR_PREFIX}.inbox-items+json`,
  inboxRevision: `${VENDOR_PREFIX}.inbox-revision+json`,
  inboxRevisions: `${VENDOR_PREFIX}.inbox-revisions+json`,
  inboxExtraction: `${VENDOR_PREFIX}.inbox-extraction+json`,
  storyCandidate: `${VENDOR_PREFIX}.story-candidate+json`,
  storyCandidates: `${VENDOR_PREFIX}.story-candidates+json`,
  iteration: `${VENDOR_PREFIX}.iteration+json`,
  iterationIntake: `${VENDOR_PREFIX}.iteration-intake+json`,
  kickoff: `${VENDOR_PREFIX}.kickoff+json`,
  kickoffProposal: `${VENDOR_PREFIX}.kickoff-proposal+json`,
  kickoffDecisionResult: `${VENDOR_PREFIX}.kickoff-decision-result+json`,
  understanding: `${VENDOR_PREFIX}.understanding+json`,
  tasking: `${VENDOR_PREFIX}.tasking+json`,
  pair: `${VENDOR_PREFIX}.pair+json`,
  pairStartResult: `${VENDOR_PREFIX}.pair-start-result+json`,
  pairActionResult: `${VENDOR_PREFIX}.pair-action-result+json`,
  showcase: `${VENDOR_PREFIX}.showcase+json`,
  showcaseActionResult: `${VENDOR_PREFIX}.showcase-action-result+json`,
  respond: `${VENDOR_PREFIX}.respond+json`,
  respondActionResult: `${VENDOR_PREFIX}.respond-action-result+json`,
  story: `${VENDOR_PREFIX}.story+json`,
  stories: `${VENDOR_PREFIX}.stories+json`,
  storyRevision: `${VENDOR_PREFIX}.story-revision+json`,
  storyRevisions: `${VENDOR_PREFIX}.story-revisions+json`,
  diagram: `${VENDOR_PREFIX}.diagram+json`,
  diagrams: `${VENDOR_PREFIX}.diagrams+json`,
  node: `${VENDOR_PREFIX}.node+json`,
  nodes: `${VENDOR_PREFIX}.nodes+json`,
  edge: `${VENDOR_PREFIX}.edge+json`,
  edges: `${VENDOR_PREFIX}.edges+json`,
  logicalEntity: `${VENDOR_PREFIX}.logical-entity+json`,
  logicalEntities: `${VENDOR_PREFIX}.logical-entities+json`,
} as const;

export type EvidenceResourceContentType =
  (typeof resourceContentTypes)[keyof typeof resourceContentTypes];

export function normalizeContentType(contentType: string | null): string {
  return contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function toApiPathname(pathname: string): string {
  if (pathname === '/') {
    return '/api';
  }

  if (pathname === '/health' || pathname.startsWith('/api')) {
    return pathname;
  }

  return `/api${pathname}`;
}
