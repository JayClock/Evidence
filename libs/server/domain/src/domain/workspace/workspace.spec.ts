import { describe, expect, it, vi } from 'vitest';
import { HasMany, HasOne, Ref, type Entity, type Many } from '../core';
import type { Diagram, WorkspaceDiagram } from '../diagram';
import type {
  CodingRun,
  Story,
  StoryCandidate,
  StoryCandidateInput,
  StoryRevision,
  StoryRevisionInput,
  WorkspaceCodingRuns,
  WorkspaceDelivery,
} from '../delivery';
import type {
  InboxItem,
  InboxRevision,
  InboxSourceInput,
  WorkspaceInbox,
} from '../inbox';
import type {
  LogicalEntity,
  LogicalEntityDescription,
  WorkspaceLogicalEntities,
} from '../logical-entity';
import type {
  LogicalRelationship,
  LogicalRelationshipDescription,
  WorkspaceLogicalRelationships,
} from '../logical-relationship';
import type { Member, MemberDescription, WorkspaceMembers } from '../member';
import { Workspace, type WorkspaceDescription } from './workspace';

const timestamp = '2026-01-01T00:00:00Z';

const workspaceDescription: WorkspaceDescription = {
  title: 'Default Workspace',
  description: 'Seed workspace',
  status: 'active',
  metadata: { source: 'test' },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const memberDescription: MemberDescription = {
  workspace: new Ref('workspace-1'),
  user: new Ref('user-1'),
  role: 'owner',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const inboxSource: InboxSourceInput = {
  sourceKind: 'manual_text',
  externalKey: 'capture-1',
  title: 'Local coding agent',
  body: 'Run Pi in the desktop app.',
  contentType: 'text/markdown',
};

const storyCandidateInput: StoryCandidateInput = {
  title: 'Local coding agent',
  problem: 'Source code must stay local.',
  role: 'Workspace maintainer',
  goal: 'Run coding work locally.',
  value: 'Credentials remain private.',
  cognitiveMode: 'complicated',
  citations: [
    {
      inboxItemId: 'inbox-1',
      inboxRevisionId: 'revision-1',
      contentSha256: `sha256:${'a'.repeat(64)}`,
      locator: 'whole-source',
    },
  ],
};

const storyRevisionInput: StoryRevisionInput = {
  ...storyCandidateInput,
  scenarios: [
    {
      title: 'Run coding in isolation',
      given: ['The repository is bound to the Workspace.'],
      when: 'The user starts a Coding Run.',
      then: ['The primary working tree remains unchanged.'],
    },
  ],
};

const logicalEntityDescription: LogicalEntityDescription = {
  workspace: new Ref('workspace-1'),
  type: 'EVIDENCE',
  subType: 'rfp',
  name: 'RFP',
  label: 'RFP',
  description: 'Request for proposal',
  attributes: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const logicalRelationshipDescription: LogicalRelationshipDescription = {
  workspace: new Ref('workspace-1'),
  source: new Ref('entity-1'),
  target: new Ref('entity-2'),
  label: 'relates to',
};

function many<E extends Entity<string, unknown>>(items: E[]): Many<E> {
  return {
    size: vi.fn(async () => items.length),
    subCollection: vi.fn((from: number, to: number) =>
      many(items.slice(from, to)),
    ),
    toArray: vi.fn(async () => [...items]),
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

function workspaceFixture() {
  const member = {} as Member;
  const diagram = {} as Diagram;
  const inboxItem = {} as InboxItem;
  const inboxRevision = {} as InboxRevision;
  const storyCandidate = {} as StoryCandidate;
  const story = {} as Story;
  const storyRevision = {} as StoryRevision;
  const codingRun = {} as CodingRun;
  const logicalEntity = {} as LogicalEntity;
  const logicalRelationship = {} as LogicalRelationship;
  const manyMembers = many([member]);
  const manyInboxItems = many([inboxItem]);
  const manyStoryCandidates = many([storyCandidate]);
  const manyCodingRuns = many([codingRun]);
  const manyLogicalEntities = many([logicalEntity]);
  const manyLogicalRelationships = many([logicalRelationship]);

  const members = {
    findAll: vi.fn(() => manyMembers),
    findByIdentity: vi.fn(async () => member),
    addMember: vi.fn(async () => member),
    updateMember: vi.fn(async () => member),
    removeMember: vi.fn(async () => undefined),
  } satisfies WorkspaceMembers;

  const diagramProjection = {
    get: vi.fn(async () => diagram),
  } satisfies WorkspaceDiagram;

  const inbox = {
    findAll: vi.fn(() => manyInboxItems),
    findByIdentity: vi.fn(async () => inboxItem),
    list: vi.fn(async () => [[inboxItem], 1] as [InboxItem[], number]),
    capture: vi.fn(async () => ({
      item: inboxItem,
      revision: inboxRevision,
      revisionCreated: true,
    })),
    appendRevision: vi.fn(async () => ({
      item: inboxItem,
      revision: inboxRevision,
      revisionCreated: true,
    })),
    changeStatus: vi.fn(async () => inboxItem),
    listRevisions: vi.fn(
      async () => [[inboxRevision], 1] as [InboxRevision[], number],
    ),
    findRevision: vi.fn(async () => inboxRevision),
  } satisfies WorkspaceInbox;

  const delivery = {
    findAll: vi.fn(() => manyStoryCandidates),
    findByIdentity: vi.fn(async () => storyCandidate),
    listCandidates: vi.fn(
      async () => [[storyCandidate], 1] as [StoryCandidate[], number],
    ),
    proposeCandidate: vi.fn(async () => storyCandidate),
    confirmCandidate: vi.fn(async () => ({
      candidate: storyCandidate,
      story,
      revision: storyRevision,
      created: true,
    })),
    rejectCandidate: vi.fn(async () => storyCandidate),
    listStories: vi.fn(async () => [[story], 1] as [Story[], number]),
    findStory: vi.fn(async () => story),
    listStoryRevisions: vi.fn(
      async () => [[storyRevision], 1] as [StoryRevision[], number],
    ),
    findStoryRevision: vi.fn(async () => storyRevision),
    appendStoryRevision: vi.fn(async () => ({
      story,
      revision: storyRevision,
    })),
  } satisfies WorkspaceDelivery;

  const codingRuns = {
    findAll: vi.fn(() => manyCodingRuns),
    findByIdentity: vi.fn(async () => codingRun),
    list: vi.fn(async () => [[codingRun], 1] as [CodingRun[], number]),
    start: vi.fn(async () => codingRun),
    submitForReview: vi.fn(async () => codingRun),
    fail: vi.fn(async () => codingRun),
    cancel: vi.fn(async () => codingRun),
    accept: vi.fn(async () => codingRun),
    reject: vi.fn(async () => codingRun),
  } satisfies WorkspaceCodingRuns;

  const logicalEntities = {
    findAll: vi.fn(() => manyLogicalEntities),
    findByIdentity: vi.fn(async () => logicalEntity),
    add: vi.fn(async () => logicalEntity),
    update: vi.fn(async () => logicalEntity),
    delete: vi.fn(async () => undefined),
    list: vi.fn(async () => [[logicalEntity], 1] as [LogicalEntity[], number]),
  } satisfies WorkspaceLogicalEntities;

  const logicalRelationships = {
    findAll: vi.fn(() => manyLogicalRelationships),
    findByIdentity: vi.fn(async () => logicalRelationship),
    add: vi.fn(async () => logicalRelationship),
    update: vi.fn(async () => logicalRelationship),
    delete: vi.fn(async () => undefined),
    list: vi.fn(
      async () => [[logicalRelationship], 1] as [LogicalRelationship[], number],
    ),
  } satisfies WorkspaceLogicalRelationships;

  const workspace = new Workspace(
    'workspace-1',
    workspaceDescription,
    members,
    diagramProjection,
    logicalEntities,
    logicalRelationships,
    inbox,
    delivery,
    codingRuns,
  );

  return {
    codingRun,
    codingRuns,
    delivery,
    diagram,
    diagramProjection,
    inbox,
    inboxItem,
    inboxRevision,
    story,
    storyCandidate,
    storyRevision,
    logicalEntities,
    logicalEntity,
    logicalRelationship,
    logicalRelationships,
    manyInboxItems,
    manyLogicalEntities,
    manyLogicalRelationships,
    manyMembers,
    member,
    members,
    workspace,
  };
}

describe('Workspace', () => {
  it('returns identity and description', () => {
    const { workspace } = workspaceFixture();

    expect(workspace.identity()).toBe('workspace-1');
    expect(workspace.description()).toBe(workspaceDescription);
  });

  it('exposes child collections as HasMany collections', async () => {
    const {
      diagram,
      inboxItem,
      logicalEntity,
      logicalRelationship,
      member,
      workspace,
    } = workspaceFixture();

    const members: HasMany<Member> = workspace.members();
    const diagramProjection: HasOne<Diagram> = workspace.diagram();
    const inbox: HasMany<InboxItem> = workspace.inbox();
    const logicalEntities: HasMany<LogicalEntity> = workspace.logicalEntities();
    const logicalRelationships: HasMany<LogicalRelationship> =
      workspace.logicalRelationships();

    await expect(
      members.findAll().subCollection(0, 10).toArray(),
    ).resolves.toEqual([member]);
    await expect(diagramProjection.get()).resolves.toBe(diagram);
    await expect(inbox.findByIdentity('inbox-1')).resolves.toBe(inboxItem);
    await expect(logicalEntities.findAll().size()).resolves.toBe(1);
    await expect(
      logicalRelationships.findAll().subCollection(0, 10).toArray(),
    ).resolves.toEqual([logicalRelationship]);
    await expect(logicalEntities.findByIdentity('entity-1')).resolves.toBe(
      logicalEntity,
    );
  });

  it('delegates member commands to the workspace members collection', async () => {
    const { member, members, workspace } = workspaceFixture();

    await expect(workspace.addMember(memberDescription)).resolves.toBe(member);
    await expect(workspace.updateMember('member-1', 'admin')).resolves.toBe(
      member,
    );
    await expect(workspace.removeMember('member-1')).resolves.toBeUndefined();

    expect(members.addMember).toHaveBeenCalledWith(memberDescription);
    expect(members.updateMember).toHaveBeenCalledWith('member-1', 'admin');
    expect(members.removeMember).toHaveBeenCalledWith('member-1');
  });

  it('delegates Inbox commands to the workspace Inbox association', async () => {
    const { inbox, inboxItem, inboxRevision, workspace } = workspaceFixture();

    await expect(workspace.captureInboxSource(inboxSource)).resolves.toEqual({
      item: inboxItem,
      revision: inboxRevision,
      revisionCreated: true,
    });
    await expect(
      workspace.appendInboxRevision('inbox-1', inboxSource, 'sha256:before'),
    ).resolves.toEqual({
      item: inboxItem,
      revision: inboxRevision,
      revisionCreated: true,
    });
    await expect(
      workspace.changeInboxItemStatus('inbox-1', 'deferred', 1),
    ).resolves.toBe(inboxItem);
    await expect(
      workspace.listInboxItems({ page: 1, pageSize: 20 }),
    ).resolves.toEqual([[inboxItem], 1]);
    await expect(
      workspace.listInboxRevisions('inbox-1', 1, 20),
    ).resolves.toEqual([[inboxRevision], 1]);
    await expect(
      workspace.findInboxRevision('inbox-1', 'revision-1'),
    ).resolves.toBe(inboxRevision);

    expect(inbox.capture).toHaveBeenCalledWith(inboxSource);
    expect(inbox.appendRevision).toHaveBeenCalledWith(
      'inbox-1',
      inboxSource,
      'sha256:before',
    );
    expect(inbox.changeStatus).toHaveBeenCalledWith('inbox-1', 'deferred', 1);
  });

  it('delegates Delivery decisions to the workspace Delivery association', async () => {
    const { delivery, story, storyCandidate, storyRevision, workspace } =
      workspaceFixture();

    await expect(
      workspace.proposeStoryCandidate(storyCandidateInput, 'user-1'),
    ).resolves.toBe(storyCandidate);
    await expect(
      workspace.confirmStoryCandidate('candidate-1', 1, 'user-1'),
    ).resolves.toEqual({
      candidate: storyCandidate,
      story,
      revision: storyRevision,
      created: true,
    });
    await expect(
      workspace.rejectStoryCandidate('candidate-2', 1, 'user-1'),
    ).resolves.toBe(storyCandidate);
    await expect(
      workspace.listStoryCandidates({ page: 1, pageSize: 20 }),
    ).resolves.toEqual([[storyCandidate], 1]);
    await expect(
      workspace.listStories({ page: 1, pageSize: 20 }),
    ).resolves.toEqual([[story], 1]);
    await expect(workspace.findStory('story-1')).resolves.toBe(story);
    await expect(
      workspace.listStoryRevisions('story-1', 1, 20),
    ).resolves.toEqual([[storyRevision], 1]);
    await expect(
      workspace.findStoryRevision('story-1', 'revision-1'),
    ).resolves.toBe(storyRevision);
    await expect(
      workspace.appendStoryRevision(
        'story-1',
        1,
        'revision-1',
        storyRevisionInput,
        'user-1',
      ),
    ).resolves.toEqual({ story, revision: storyRevision });

    expect(delivery.proposeCandidate).toHaveBeenCalledWith(
      storyCandidateInput,
      'user-1',
    );
    expect(delivery.confirmCandidate).toHaveBeenCalledWith(
      'candidate-1',
      1,
      'user-1',
    );
    expect(delivery.rejectCandidate).toHaveBeenCalledWith(
      'candidate-2',
      1,
      'user-1',
    );
    expect(delivery.appendStoryRevision).toHaveBeenCalledWith(
      'story-1',
      1,
      'revision-1',
      storyRevisionInput,
      'user-1',
    );
  });

  it('delegates logical entity commands to the workspace logical entities collection', async () => {
    const { logicalEntities, logicalEntity, workspace } = workspaceFixture();

    await expect(
      workspace.addLogicalEntity(logicalEntityDescription),
    ).resolves.toBe(logicalEntity);
    await expect(
      workspace.updateLogicalEntity('entity-1', logicalEntityDescription),
    ).resolves.toBe(logicalEntity);
    await expect(
      workspace.deleteLogicalEntity('entity-1'),
    ).resolves.toBeUndefined();
    await expect(workspace.listLogicalEntities(2, 25)).resolves.toEqual([
      [logicalEntity],
      1,
    ]);

    expect(logicalEntities.add).toHaveBeenCalledWith(logicalEntityDescription);
    expect(logicalEntities.update).toHaveBeenCalledWith(
      'entity-1',
      logicalEntityDescription,
    );
    expect(logicalEntities.delete).toHaveBeenCalledWith('entity-1');
    expect(logicalEntities.list).toHaveBeenCalledWith(2, 25);
  });

  it('delegates logical relationship commands to the workspace logical relationships collection', async () => {
    const { logicalRelationship, logicalRelationships, workspace } =
      workspaceFixture();

    await expect(
      workspace.addLogicalRelationship(logicalRelationshipDescription),
    ).resolves.toBe(logicalRelationship);
    await expect(
      workspace.updateLogicalRelationship(
        'relationship-1',
        logicalRelationshipDescription,
      ),
    ).resolves.toBe(logicalRelationship);
    await expect(
      workspace.deleteLogicalRelationship('relationship-1'),
    ).resolves.toBeUndefined();
    await expect(workspace.listLogicalRelationships(2, 25)).resolves.toEqual([
      [logicalRelationship],
      1,
    ]);

    expect(logicalRelationships.add).toHaveBeenCalledWith(
      logicalRelationshipDescription,
    );
    expect(logicalRelationships.update).toHaveBeenCalledWith(
      'relationship-1',
      logicalRelationshipDescription,
    );
    expect(logicalRelationships.delete).toHaveBeenCalledWith('relationship-1');
    expect(logicalRelationships.list).toHaveBeenCalledWith(2, 25);
  });
});
