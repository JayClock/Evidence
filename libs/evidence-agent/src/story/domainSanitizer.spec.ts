import { expect, it } from 'vitest';
import {
  sanitizeDocumentTitle,
  sanitizeRoleLabel,
  storyRoleOf,
} from './domainSanitizer.js';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { modelFixture } from './testing/fixtures.js';

it('removes only presentation boilerplate without stripping business qualifiers', () => {
  expect(sanitizeRoleLabel('采购方角色（Procurement Buyer Role）')).toBe(
    '采购方',
  );
  expect(sanitizeRoleLabel('支付网关运维')).toBe('支付网关运维');
  expect(sanitizeRoleLabel('合同当事人')).toBe('合同当事人');
  expect(sanitizeRoleLabel('角色')).toBe('角色');
  expect(
    sanitizeDocumentTitle('采购合同（Master Procurement Agreement）'),
  ).toBe('采购合同');
  expect(sanitizeDocumentTitle('采购合同（补充协议）')).toBe(
    '采购合同（补充协议）',
  );
  expect(sanitizeDocumentTitle('付款申请 (USD)')).toBe('付款申请 (USD)');
  expect(sanitizeDocumentTitle('Purchase Order (USD)')).toBe(
    'Purchase Order (USD)',
  );
  expect(sanitizeDocumentTitle('付款申请（REV A）')).toBe('付款申请（REV A）');
});

it('resolves organizations only from unambiguous party-to-role bindings', () => {
  const model = modelFixture();
  model.entities.push(
    {
      type: 'entity',
      id: 'supplier',
      category: 'participant',
      kind: 'party',
      label: '顶峰数控',
    },
    {
      type: 'entity',
      id: 'other',
      category: 'participant',
      kind: 'party',
      label: '另一供应商',
    },
  );
  model.relationships.push({
    type: 'relationship',
    id: 'supplier-role',
    label: '担任卖方',
    kind: 'plays_role',
    sourceRef: 'supplier',
    targetRef: 'role.seller',
  });
  expect(
    storyRoleOf(createDomainGraph(model), 'role.seller')?.organization,
  ).toBe('顶峰数控');
  model.relationships.push({
    ...model.relationships[0]!,
    id: 'other-role',
    sourceRef: 'other',
  });
  expect(
    storyRoleOf(createDomainGraph(model), 'role.seller')?.organization,
  ).toBeUndefined();
  expect(storyRoleOf(createDomainGraph(model), 'role.missing')).toBeUndefined();
});
