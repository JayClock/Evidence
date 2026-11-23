import type { HypermediaLink } from './hateoasWeaver.js';

export type LinkDecision =
  | { available: true; parameters: Readonly<Record<string, string>> }
  | { available: false | 'unknown' };

export interface RuntimeHalLink {
  href: string;
  method?: HypermediaLink['method'];
}

/**
 * Render affordances for one representation. The resource owner must supply a
 * decision based on the current caller, state, clock and modeled rules for
 * this exact link (including its branch ref). Unknown means no action link.
 * A link is advisory: command handlers must recheck the same policy on write.
 */
export const resolveRuntimeHalLinks = (
  links: readonly HypermediaLink[],
  routeId: string,
  decide: (link: HypermediaLink) => LinkDecision,
): Record<string, RuntimeHalLink> => {
  const result: [string, RuntimeHalLink][] = [];
  for (const link of links) {
    if (link.sourceRouteId !== routeId) continue;
    const decision = decide(link);
    if (decision.available !== true) continue;
    let bound = true;
    const href = link.href.replace(/\{([^{}]+)\}/g, (_, name: string) => {
      const value = Object.hasOwn(decision.parameters, name)
        ? decision.parameters[name]
        : undefined;
      if (!value || value === '.' || value === '..') {
        bound = false;
        return '';
      }
      return encodeURIComponent(value);
    });
    if (!bound) continue;
    result.push([
      link.rel,
      { href, ...(link.rel === 'self' ? {} : { method: link.method }) },
    ]);
  }
  return Object.fromEntries(result);
};
