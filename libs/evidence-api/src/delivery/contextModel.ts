import {
  DomainIdSchema,
  DomainModelDocumentSyntaxSchema,
  EntityASTSchema,
  RelationshipASTSchema,
  RuleASTSchema,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import { errorDiagnostic, type Diagnostic } from '../diagnostics.js';

const recordOf = (item: unknown): Record<string, unknown> | undefined =>
  item !== null && typeof item === 'object' && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : undefined;
const stringOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** Isolate malformed rows only when we can still prove which Context owns them. */
export function contextModelOf(input: DomainModelDocument) {
  if (
    !Array.isArray(input.entities) ||
    !Array.isArray(input.relationships) ||
    !Array.isArray(input.rules)
  )
    throw new Error('FM_INVALID: model collections must be arrays');
  const model = DomainModelDocumentSyntaxSchema.parse({
    ...input,
    entities: [],
    relationships: [],
    rules: [],
  });
  const items = [input.entities, input.relationships, input.rules].flatMap(
    (array) => [...array],
  );
  const ids = items.flatMap((item) => {
    const id = stringOf(recordOf(item)?.['id']);
    return id === undefined ? [] : [id];
  });
  if (new Set(ids).size !== ids.length)
    throw new Error('FM_INVALID: duplicate model IDs');
  const contexts = new Map<string, Diagnostic[]>();
  const rawOwners = new Map<string, string>();
  for (const item of input.entities) {
    const entity = recordOf(item);
    const id = stringOf(entity?.['id']);
    if (id === undefined) continue;
    if (
      entity?.['category'] === 'context' &&
      DomainIdSchema.safeParse(id).success
    ) {
      contexts.set(id, []);
      rawOwners.set(id, id);
    } else {
      const context = stringOf(entity?.['contextRef']);
      if (context !== undefined) rawOwners.set(id, context);
    }
  }
  const ownerOf = (ref: unknown) =>
    typeof ref === 'string' ? rawOwners.get(ref) : undefined;
  const malformed = (
    item: unknown,
    location: string,
    issues: readonly { path: readonly (string | number)[]; message: string }[],
    owners: readonly (string | undefined)[],
  ) => {
    const targets = [...new Set(owners)].flatMap((id) => {
      const group = id === undefined ? undefined : contexts.get(id);
      return group ? [group] : [];
    });
    if (!targets.length)
      throw new Error(
        `FM_INVALID: cannot attribute ${location}: ${issues.map(({ message }) => message).join('; ')}`,
      );
    for (const { path, message } of issues) {
      const pathSuffix = path.length ? `.${path.join('.')}` : '';
      const diagnostic = errorDiagnostic(
        'FM_INVALID',
        message,
        stringOf(recordOf(item)?.['id']),
        `${location}${pathSuffix}`,
      );
      for (const target of targets) target.push(diagnostic);
    }
  };
  for (const [index, item] of input.entities.entries()) {
    const parsed = EntityASTSchema.safeParse(item);
    if (parsed.success) model.entities.push(parsed.data);
    else
      malformed(item, `entities[${index}]`, parsed.error.issues, [
        ownerOf(recordOf(item)?.['id']),
        stringOf(recordOf(item)?.['contextRef']),
      ]);
  }
  for (const [index, item] of input.relationships.entries()) {
    const parsed = RelationshipASTSchema.safeParse(item);
    if (parsed.success) model.relationships.push(parsed.data);
    else {
      const edge = recordOf(item);
      malformed(item, `relationships[${index}]`, parsed.error.issues, [
        ownerOf(edge?.['sourceRef']),
        ownerOf(edge?.['targetRef']),
      ]);
    }
  }
  for (const [index, item] of input.rules.entries()) {
    const parsed = RuleASTSchema.safeParse(item);
    if (parsed.success) model.rules.push(parsed.data);
    else {
      const rule = recordOf(item);
      malformed(item, `rules[${index}]`, parsed.error.issues, [
        stringOf(rule?.['contextRef']),
        ownerOf(recordOf(rule?.['target'])?.['entityRef']),
      ]);
    }
  }
  return { model, contexts, ownerOf };
}
