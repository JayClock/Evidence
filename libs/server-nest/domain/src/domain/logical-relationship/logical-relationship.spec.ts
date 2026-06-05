import { describe, expect, it } from 'vitest';
import { Ref } from '../core';
import {
  LogicalRelationship,
  type LogicalRelationshipDescription,
} from './logical-relationship';

const logicalRelationshipDescription: LogicalRelationshipDescription = {
  workspace: new Ref('workspace-1'),
  source: new Ref('entity-1'),
  target: new Ref('entity-2'),
  label: 'relates to',
};

describe('LogicalRelationship', () => {
  it('returns identity and description', () => {
    const relationship = new LogicalRelationship(
      'relationship-1',
      logicalRelationshipDescription,
    );

    expect(relationship.identity()).toBe('relationship-1');
    expect(relationship.description()).toBe(logicalRelationshipDescription);
  });
});
