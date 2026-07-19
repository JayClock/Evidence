import { describe, expect, it } from 'vitest';
import { asStore, mockPrismaStore } from './test-support';
import { PrismaWorkspaceDiagram } from './workspace-diagrams';

describe('PrismaWorkspaceDiagram', () => {
  it('projects the current workspace model as one stable diagram', async () => {
    const store = mockPrismaStore();
    const projection = new PrismaWorkspaceDiagram(
      asStore(store),
      'workspace-1',
    );

    const diagram = await projection.get();

    expect(diagram.identity()).toBe('model');
    expect(diagram.description()).toMatchObject({
      workspace: expect.objectContaining({ id: expect.any(Function) }),
      title: 'Model',
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(diagram.description().workspace.id()).toBe('workspace-1');
  });
});
