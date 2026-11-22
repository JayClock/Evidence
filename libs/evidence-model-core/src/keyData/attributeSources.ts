import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { ModelAdvisory } from '../validation/lintRules.js';

const pathOf = (ref: string, attribute: string) => `${ref}#${attribute}`;

/** Unverified source declarations are draftable, but must not resolve lineage. */
export const inspectAttributeSources = (
  model: DomainModelDocument,
): ReadonlyMap<string, ModelAdvisory> => {
  const entities = new Map(model.entities.map((entity) => [entity.id, entity]));
  const warnings = new Map<string, ModelAdvisory>();
  const links = new Map<string, { entityId: string; providerPath: string }>();
  const warn = (path: string, entityId: string, reason: string) => {
    warnings.set(path, {
      code: 'ATTRIBUTE_SOURCE_UNVERIFIED',
      entityId,
      message: `${path}: ${reason}`,
    });
  };

  for (const entity of model.entities) {
    for (const attribute of entity.attributes ?? []) {
      const source = attribute.source;
      if (source === null || typeof source !== 'object') continue;
      const path = pathOf(entity.id, attribute.name);
      if (attribute.derivedByRuleRef !== undefined) {
        warn(
          path,
          entity.id,
          'A direct source conflicts with the derivation rule.',
        );
        continue;
      }
      if (!('entityRef' in source)) {
        const valid =
          entity.category === 'evidence' &&
          (source.kind === 'request-input'
            ? entity.kind === 'fulfillment_request'
            : entity.kind === 'fulfillment_confirmation' ||
              entity.kind === 'other_evidence');
        if (!valid)
          warn(
            path,
            entity.id,
            `'${source.kind}' must be declared on its producing Evidence.`,
          );
        continue;
      }
      const provider = entities.get(source.entityRef);
      const providerPath = pathOf(source.entityRef, source.attribute);
      const input = provider?.attributes?.find(
        ({ name }) => name === source.attribute,
      );
      if (input === undefined) {
        warn(path, entity.id, `Unknown source attribute '${providerPath}'.`);
        continue;
      }
      const providerFits =
        source.kind === 'contract-term'
          ? provider?.category === 'evidence' && provider.kind === 'contract'
          : source.kind === 'domain-source'
            ? provider?.category === 'participant' && provider.kind === 'thing'
            : provider?.category === 'evidence' && provider.id !== entity.id;
      if (!providerFits) {
        warn(
          path,
          entity.id,
          `'${providerPath}' is not a valid ${source.kind} provider.`,
        );
      } else if (
        attribute.valueType !== undefined &&
        input.valueType !== undefined &&
        attribute.valueType !== input.valueType
      ) {
        warn(
          path,
          entity.id,
          'A direct source must have the same value type; use a derivation for a conversion.',
        );
      } else {
        links.set(path, { entityId: entity.id, providerPath });
      }
    }
  }

  const checked = new Set<string>();
  for (const path of links.keys()) {
    const chain = new Set<string>();
    let cursor = path;
    while (links.has(cursor) && !checked.has(cursor) && !chain.has(cursor)) {
      chain.add(cursor);
      cursor = links.get(cursor)!.providerPath;
    }
    const reason = chain.has(cursor)
      ? `Source chain reaches a cycle at '${cursor}'.`
      : warnings.has(cursor)
        ? `Source chain reaches an unverified declaration at '${cursor}'.`
        : undefined;
    for (const member of chain) {
      checked.add(member);
      if (reason !== undefined)
        warn(member, links.get(member)!.entityId, reason);
    }
  }
  return warnings;
};
