import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { isEvidenceEntity } from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { FulfillmentPairSection } from './FulfillmentPairSection';

const setup = (document: DomainModelDocument) => {
  const graph = createDomainGraph(document);
  const entity = graph.getEntity('evidence.request');
  if (!isEvidenceEntity(entity)) throw new Error('Missing request fixture');
  render(<FulfillmentPairSection entity={entity} graph={graph} />);
  return within(screen.getByRole('region', { name: '履约结构' }));
};

describe('FulfillmentPairSection', () => {
  it('separates missing rules from declared confirmation evidence', () => {
    const region = setup({ ...createDesktopFixture(), rules: [] });
    expect(region.getByText('未声明完成规则')).toBeVisible();
    expect(region.getByText('未声明违约规则')).toBeVisible();
    expect(region.getByText('evidence.confirmation')).toBeVisible();
    expect(region.queryByRole('button')).toBeNull();
  });

  it('shows modeled completion and breach rules as read-only CEL', () => {
    const document = createDesktopFixture();
    document.rules.push({
      type: 'rule',
      id: 'rule.delivery-breach',
      kind: 'breach',
      label: '交付逾期',
      description: '请求超过约定的时间。',
      contextRef: 'context.procurement',
      bindings: {
        request: { ref: 'evidence.request' },
        now: { type: 'timestamp' },
      },
      expression: 'now > request.expired_at',
      resultType: 'bool',
    });
    const region = setup(document);
    const completion = region.getByRole('textbox', {
      name: 'rule.delivery-completion CEL 表达式',
    });
    const breach = region.getByRole('textbox', {
      name: 'rule.delivery-breach CEL 表达式',
    });
    expect(completion).toHaveTextContent(
      'confirmation.confirmed_at <= request.expired_at',
    );
    expect(breach).toHaveTextContent('now > request.expired_at');
    expect(breach).toHaveAttribute('aria-readonly', 'true');
    expect(region.queryByRole('combobox')).toBeNull();
  });
});
