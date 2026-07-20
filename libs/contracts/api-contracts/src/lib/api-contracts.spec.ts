import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  apiBaseUrl,
  apiRequest,
  apiTextRequest,
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
  logicalRelationship: 'application/vnd.evidence.logical-relationship+json',
  logicalRelationships: 'application/vnd.evidence.logical-relationships+json',
  member: 'application/vnd.evidence.member+json',
  members: 'application/vnd.evidence.members+json',
  diagram: 'application/vnd.evidence.diagram+json',
  nodes: 'application/vnd.evidence.nodes+json',
  edges: 'application/vnd.evidence.edges+json',
} as const;

async function createContractWorkspace(prefix: string) {
  const title = uniqueName(prefix);
  const root = process.env.CONTRACT_WORKSPACE_ROOT;
  let path: string | undefined;
  if (root) {
    path = join(root, title.replace(/[^a-zA-Z0-9]+/g, '-'));
    await mkdir(path, { recursive: true });
  }
  return apiRequest('/api/users/desktop-user/workspaces', {
    method: 'POST',
    body: JSON.stringify({
      title,
      ...(path ? { path } : {}),
      metadata: { source: 'api-contracts' },
    }),
  });
}

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

    const openapi = await apiRequest('/api/openapi.json');
    expect(openapi.status).toBe(200);
    expect(openapi.body.paths).toHaveProperty(
      '/api/workspaces/{workspaceId}/diagram/propose-model',
    );

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
    const created = await createContractWorkspace('Contract Workspace');
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
    const workspace = await createContractWorkspace('Logical Entity Workspace');
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

  it('enforces member uniqueness and exposes the singular diagram projection', async () => {
    const workspace = await createContractWorkspace('Member Diagram Workspace');
    const workspaceId = workspace.body.id as string;

    const members = await apiRequest(
      `/api/users/${userId}/workspaces/${workspaceId}/members`,
    );
    expect(members.status).toBe(200);
    expectHalResource(members, mediaTypes.members);
    expect(members.body._embedded.members).toHaveLength(1);
    const owner = members.body._embedded.members[0];
    expect(owner).toMatchObject({ role: 'owner', user: { id: userId } });

    const duplicate = await apiRequest(
      `/api/users/${userId}/workspaces/${workspaceId}/members`,
      {
        method: 'POST',
        body: JSON.stringify({ user: { id: userId }, role: 'member' }),
      },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatch(/already/i);

    const member = await apiRequest(
      `/api/users/${userId}/workspaces/${workspaceId}/members/${owner.id}`,
    );
    expect(member.status).toBe(200);
    expectHalResource(member, mediaTypes.member);

    const diagram = await apiRequest(`/api/workspaces/${workspaceId}/diagram`);
    expect(diagram.status).toBe(200);
    expectHalResource(diagram, mediaTypes.diagram);
    expect(diagram.body).toMatchObject({ id: 'model' });
    expect(diagram.body._links).toMatchObject({
      nodes: { href: `/api/workspaces/${workspaceId}/diagram/nodes` },
      edges: { href: `/api/workspaces/${workspaceId}/diagram/edges` },
    });

    const nodes = await apiRequest(
      `/api/workspaces/${workspaceId}/diagram/nodes`,
    );
    expect(nodes.status).toBe(200);
    expectHalResource(nodes, mediaTypes.nodes);
    expect(nodes.body._embedded.nodes).toEqual(expect.any(Array));

    const edges = await apiRequest(
      `/api/workspaces/${workspaceId}/diagram/edges`,
    );
    expect(edges.status).toBe(200);
    expectHalResource(edges, mediaTypes.edges);
    expect(edges.body._embedded.edges).toEqual(expect.any(Array));

    const removed = await apiRequest(
      `/api/users/${userId}/workspaces/${workspaceId}/members/${owner.id}`,
      { method: 'DELETE' },
    );
    expect(removed.status).toBe(204);
  });

  it('persists relationships, projects them as edges, and streams proposals', async () => {
    const workspace = await createContractWorkspace('Relationship Workspace');
    const workspaceId = workspace.body.id as string;
    const createEntity = (name: string, type: string, subType: string) =>
      apiRequest(`/api/workspaces/${workspaceId}/logical-entities`, {
        method: 'POST',
        body: JSON.stringify({ name, type, subType, attributes: [] }),
      });
    const source = await createEntity(
      uniqueName('Order'),
      'EVIDENCE',
      'EVIDENCE:other_evidence',
    );
    const target = await createEntity(
      uniqueName('Customer'),
      'PARTICIPANT',
      'PARTICIPANT:party',
    );

    const invalid = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships`,
      {
        method: 'POST',
        body: JSON.stringify({
          source: { id: source.body.id },
          target: { id: 'missing' },
          label: 'invalid',
        }),
      },
    );
    expect(invalid.status).toBe(400);

    const created = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships`,
      {
        method: 'POST',
        body: JSON.stringify({
          source: { id: source.body.id },
          target: { id: target.body.id },
          label: 'belongs to',
        }),
      },
    );
    expect(created.status).toBe(201);
    expectHalResource(created, mediaTypes.logicalRelationships);

    const listed = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships?page=1&pageSize=20`,
    );
    expect(listed.status).toBe(200);
    expectHalCollection(
      listed,
      mediaTypes.logicalRelationships,
      'logicalRelationships',
    );

    const updated = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships/${created.body.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ label: 'submitted by' }),
      },
    );
    expect(updated.status).toBe(200);
    expectHalResource(updated, mediaTypes.logicalRelationship);
    expect(updated.body.label).toBe('submitted by');

    const edges = await apiRequest(
      `/api/workspaces/${workspaceId}/diagram/edges`,
    );
    expect(edges.body._embedded.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          logicalRelationship: { id: created.body.id },
        }),
      ]),
    );

    const proposal = await apiTextRequest(
      `/api/workspaces/${workspaceId}/diagram/propose-model`,
      {
        method: 'POST',
        body: JSON.stringify({ requirement: 'Model an auditable order' }),
      },
    );
    expect(proposal.status).toBe(200);
    expect(proposal.headers.get('content-type')).toContain('text/event-stream');
    expect(proposal.body).toContain('data: contract proposal');
    expect(proposal.body).toContain('event: complete');

    const deleted = await apiRequest(
      `/api/workspaces/${workspaceId}/logical-relationships/${created.body.id}`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: true });
  });
});
