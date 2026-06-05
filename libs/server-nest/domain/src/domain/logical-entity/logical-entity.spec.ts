import { describe, expect, it } from 'vitest';
import { Ref } from '../core';
import { LogicalEntity, type LogicalEntityDescription } from './logical-entity';

const timestamp = '2026-01-01T00:00:00Z';

const logicalEntityDescription: LogicalEntityDescription = {
  workspace: new Ref('workspace-1'),
  type: 'EVIDENCE',
  subType: 'rfp',
  name: 'RFP',
  label: 'RFP',
  description: 'Request for proposal',
  attributes: [
    {
      id: 'attribute-1',
      name: 'number',
      label: 'Number',
      type: 'string',
      description: null,
    },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('LogicalEntity', () => {
  it('returns identity and description', () => {
    const entity = new LogicalEntity('entity-1', logicalEntityDescription);

    expect(entity.identity()).toBe('entity-1');
    expect(entity.description()).toBe(logicalEntityDescription);
  });
});
