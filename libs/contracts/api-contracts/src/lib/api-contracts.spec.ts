import {
  apiBaseUrl,
  apiRequest,
  expectHalCollection,
  expectHalResource,
  expectResourceContentType,
  uniqueName,
} from './api-contracts.js';

const describeContracts = apiBaseUrl ? describe : describe.skip;

const mediaTypes = {
  root: 'application/vnd.evidence.root+json',
  health: 'application/vnd.evidence.health+json',
  user: 'application/vnd.evidence.user+json',
  workspace: 'application/vnd.evidence.workspace+json',
  workspaces: 'application/vnd.evidence.workspaces+json',
  logicalEntity: 'application/vnd.evidence.logical-entity+json',
  logicalEntities: 'application/vnd.evidence.logical-entities+json',
} as const;

describeContracts('Evidence API contract vertical slice', () => {
  const userId = 'desktop-user';

  it('exposes root, health, user, and seeded workspace resources as HAL-style resources', async () => {
    const root = await apiRequest('/api');
    expect(root.status).toBe(200);
    expectHalResource(root, mediaTypes.root);
    expect(root.body._links).toMatchObject({
      self: { href: '/api' },
      health: { href: '/health' },
      'default-user': { href: '/api/users/desktop-user' },
    });

    const health = await apiRequest('/health');
    expect(health.status).toBe(200);
    expectHalResource(health, mediaTypes.health);
    expect(health.body.status).toBe('ok');

    const user = await apiRequest(`/api/users/${userId}`);
    expect(user.status).toBe(200);
    expectHalResource(user, mediaTypes.user);
    expect(user.body).toMatchObject({ id: userId, name: 'Desktop User' });
    expect(user.body._links).toMatchObject({
      self: { href: `/api/users/${userId}` },
      workspaces: { href: `/api/users/${userId}/workspaces` },
    });

    const workspaces = await apiRequest(
      `/api/users/${userId}/workspaces?page=1&pageSize=20`,
    );
    expect(workspaces.status).toBe(200);
    expectHalCollection(workspaces, mediaTypes.workspaces, 'workspaces');
    expect(workspaces.body.page).toMatchObject({ number: 1, size: 20 });
    expect(workspaces.body._embedded.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _links: expect.objectContaining({
            self: expect.objectContaining({ href: expect.any(String) }),
            collection: { href: `/api/users/${userId}/workspaces` },
          }),
          id: 'default-workspace',
          title: 'Default Workspace',
        }),
      ]),
    );
  });

  it('creates, reads, updates, lists, and deletes workspaces', async () => {
    const created = await apiRequest(`/api/users/${userId}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({
        title: uniqueName('Contract Workspace'),
        description: 'created by contract tests',
        metadata: { source: 'api-contracts' },
      }),
    });
    expect(created.status).toBe(201);
    expectHalResource(created, mediaTypes.workspaces);
    expect(created.body).toMatchObject({
      status: 'active',
      metadata: { source: 'api-contracts' },
    });
    expect(created.body._links).toMatchObject({
      self: { href: `/api/users/${userId}/workspaces/${created.body.id}` },
      collection: { href: `/api/users/${userId}/workspaces` },
      'logical-entities': {
        href: `/api/workspaces/${created.body.id}/logical-entities`,
      },
    });

    const fetched = await apiRequest(
      `/api/users/${userId}/workspaces/${created.body.id}`,
    );
    expect(fetched.status).toBe(200);
    expectHalResource(fetched, mediaTypes.workspace);
    expect(fetched.body.id).toBe(created.body.id);

    const updated = await apiRequest(
      `/api/users/${userId}/workspaces/${created.body.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Updated Contract Workspace',
          description: null,
          status: 'active',
          metadata: { updated: 'true' },
        }),
      },
    );
    expect(updated.status).toBe(200);
    expectHalResource(updated, mediaTypes.workspace);
    expect(updated.body).toMatchObject({
      id: created.body.id,
      title: 'Updated Contract Workspace',
      description: null,
      metadata: { updated: 'true' },
    });

    const deleted = await apiRequest(
      `/api/users/${userId}/workspaces/${created.body.id}`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(204);
    expect(deleted.headers.get('content-type')).toBeNull();

    const missing = await apiRequest(
      `/api/users/${userId}/workspaces/${created.body.id}`,
    );
    expect(missing.status).toBe(404);
  });

  it('creates, reads, updates, lists, and deletes logical entities', async () => {
    const workspace = await apiRequest(`/api/users/${userId}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ title: uniqueName('Logical Entity Workspace') }),
    });
    expect(workspace.status).toBe(201);
    expectHalResource(workspace, mediaTypes.workspaces);

    const created = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'EVIDENCE',
          subType: 'EVIDENCE:rfp',
          name: uniqueName('RequestForProposal'),
          label: 'RFP',
          description: 'Evidence definition',
          attributes: [],
        }),
      },
    );
    expect(created.status).toBe(201);
    expectHalResource(created, mediaTypes.logicalEntities);
    expect(created.body).toMatchObject({
      type: 'EVIDENCE',
      subType: 'EVIDENCE:rfp',
      label: 'RFP',
    });
    expect(created.body._links).toMatchObject({
      self: {
        href: `/api/workspaces/${workspace.body.id}/logical-entities/${created.body.id}`,
      },
      collection: {
        href: `/api/workspaces/${workspace.body.id}/logical-entities`,
      },
    });

    const listed = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities?page=1&pageSize=50`,
    );
    expect(listed.status).toBe(200);
    expectHalCollection(listed, mediaTypes.logicalEntities, 'logicalEntities');
    expect(listed.body._embedded.logicalEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _links: expect.objectContaining({
            self: expect.objectContaining({ href: expect.any(String) }),
          }),
          id: created.body.id,
        }),
      ]),
    );

    const fetched = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities/${created.body.id}`,
    );
    expect(fetched.status).toBe(200);
    expectHalResource(fetched, mediaTypes.logicalEntity);

    const updated = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities/${created.body.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          type: 'PARTICIPANT',
          subType: 'PARTICIPANT:party',
          name: 'Customer',
        }),
      },
    );
    expect(updated.status).toBe(200);
    expectHalResource(updated, mediaTypes.logicalEntity);
    expect(updated.body).toMatchObject({
      id: created.body.id,
      type: 'PARTICIPANT',
      subType: 'PARTICIPANT:party',
      name: 'Customer',
    });

    const deleted = await apiRequest(
      `/api/workspaces/${workspace.body.id}/logical-entities/${created.body.id}`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(200);
    expectResourceContentType(deleted, mediaTypes.logicalEntity);
    expect(deleted.body).toEqual({ deleted: true });
  });
});
