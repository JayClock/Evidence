const VENDOR_PREFIX = 'application/vnd.evidence';

export const resourceContentTypes = {
  root: `${VENDOR_PREFIX}.root+json`,
  health: `${VENDOR_PREFIX}.health+json`,
  user: `${VENDOR_PREFIX}.user+json`,
  sidebar: `${VENDOR_PREFIX}.sidebar+json`,
  workspace: `${VENDOR_PREFIX}.workspace+json`,
  workspaces: `${VENDOR_PREFIX}.workspaces+json`,
  member: `${VENDOR_PREFIX}.member+json`,
  members: `${VENDOR_PREFIX}.members+json`,
  diagram: `${VENDOR_PREFIX}.diagram+json`,
  diagrams: `${VENDOR_PREFIX}.diagrams+json`,
  node: `${VENDOR_PREFIX}.node+json`,
  nodes: `${VENDOR_PREFIX}.nodes+json`,
  edge: `${VENDOR_PREFIX}.edge+json`,
  edges: `${VENDOR_PREFIX}.edges+json`,
  diagramVersion: `${VENDOR_PREFIX}.diagram-version+json`,
  diagramVersions: `${VENDOR_PREFIX}.diagram-versions+json`,
  logicalEntity: `${VENDOR_PREFIX}.logical-entity+json`,
  logicalEntities: `${VENDOR_PREFIX}.logical-entities+json`,
} as const;

export type EvidenceResourceContentType =
  (typeof resourceContentTypes)[keyof typeof resourceContentTypes];

export function normalizeContentType(contentType: string | null): string {
  return contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function toAppPathname(pathname: string): string {
  if (pathname === '/api') {
    return '/';
  }

  if (pathname.startsWith('/api/')) {
    return pathname.slice('/api'.length);
  }

  return pathname;
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
