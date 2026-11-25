import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import { isPartyRole, isRoleEntity } from '@evidence-poc/evidence-schema';
import type { StoryRole } from './types.js';

// Only remove a trailing English gloss from a Chinese label. Parentheticals
// containing a business identifier, unit, or qualifier are not translations.
const withoutGloss = (value: string): string => {
  const label = value.trim();
  const match = /^(.*?)(?:（([A-Za-z ]+)）|\(([A-Za-z ]+)\))$/u.exec(label);
  const name = match?.[1]?.trimEnd();
  const gloss = match?.[2] ?? match?.[3];
  return name &&
    gloss &&
    /\p{Script=Han}/u.test(name) &&
    /(?:^| )(?:Role|Agreement|Confirmation|Certificate|Request|Proposal|RFP|Notice)$/u.test(
      gloss,
    )
    ? name
    : label;
};

export const sanitizeDocumentTitle = (label: string): string =>
  withoutGloss(label);

export const sanitizeRoleLabel = (label: string): string => {
  const short = withoutGloss(label);
  // Do not strip interior words (e.g. 支付网关运维) or assign a fictional job title.
  return short.replace(/\s*角色$/u, '').trimEnd() || short;
};

export const storyRoleOf = (
  graph: DomainGraph | undefined,
  ref: string | undefined,
): StoryRole | undefined => {
  if (!graph || !ref) return undefined;
  const role = graph.getEntity(ref);
  if (!isRoleEntity(role)) return undefined;
  const organizations = isPartyRole(role)
    ? new Set(
        graph.incoming(role.id).flatMap(({ kind, sourceRef }) => {
          const source = graph.getEntity(sourceRef);
          return kind === 'plays_role' &&
            source?.category === 'participant' &&
            source.kind === 'party'
            ? [sourceRef]
            : [];
        }),
      )
    : new Set<string>();
  const organizationRef =
    organizations.size === 1 ? organizations.values().next().value : undefined;
  const organization = organizationRef
    ? graph.getEntity(organizationRef)
    : undefined;
  return {
    roleId: role.id,
    businessName: sanitizeRoleLabel(role.label),
    ...(organization
      ? { organization: sanitizeDocumentTitle(organization.label) }
      : {}),
  };
};
