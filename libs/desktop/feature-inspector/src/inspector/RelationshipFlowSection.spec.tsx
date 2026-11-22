import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { RELATIONSHIP_FLOW_LABELS } from '@evidence-poc/evidence-schema';
import { RelationshipFlowSection } from './RelationshipFlowSection';

describe('relationship flow inspection', () => {
  it('shows declared escalation and handoff notes without editing controls', () => {
    const document = createDesktopFixture();
    const edge = document.relationships.find(
      (edge) =>
        edge.sourceRef === 'evidence.confirmation' &&
        edge.kind === 'references',
    )!;
    document.relationships = document.relationships.map((item) =>
      item.id === edge.id
        ? { ...item, flowKind: 'escalation', notes: '交由业务负责人受理。' }
        : item,
    );
    render(
      <RelationshipFlowSection
        entityId={edge.sourceRef}
        graph={createDomainGraph(document)}
      />,
    );
    const region = within(screen.getByRole('region', { name: '履约引用路径' }));
    expect(
      region.getByText(`路径类型：${RELATIONSHIP_FLOW_LABELS.escalation}`),
    ).toBeVisible();
    expect(region.getByText('交由业务负责人受理。')).toBeVisible();
    expect(region.queryByRole('combobox')).toBeNull();
    expect(region.queryByRole('textbox')).toBeNull();
  });
});
