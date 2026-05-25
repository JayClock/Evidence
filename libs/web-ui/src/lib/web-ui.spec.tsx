import { render, screen } from '@testing-library/react';

import { CollectionPanel } from './collection-panel';
import { ResourceCard } from './resource-card';
import { StatusCard } from './status-card';

describe('web-ui components', () => {
  it('renders status content', () => {
    render(<StatusCard title="Loading" detail="Fetching resource…" />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Loading')).toBeTruthy();
    expect(screen.getByText('Fetching resource…')).toBeTruthy();
  });

  it('renders collection items', () => {
    render(
      <CollectionPanel
        eyebrow="Collection"
        title="Diagrams"
        total={1}
        items={[{ id: 'diagram-1', title: 'Context Map', detail: 'draft' }]}
      />,
    );

    expect(screen.getByText('Diagrams')).toBeTruthy();
    expect(screen.getByText('1 total')).toBeTruthy();
    expect(screen.getByText('Context Map')).toBeTruthy();
  });

  it('renders resource links as labels', () => {
    render(
      <ResourceCard
        title="API root"
        detail="Discovered links"
        links={['self', 'health']}
      />,
    );

    expect(screen.getByText('API root')).toBeTruthy();
    expect(screen.getByText('health')).toBeTruthy();
  });
});
