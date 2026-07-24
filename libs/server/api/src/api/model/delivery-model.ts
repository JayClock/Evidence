import type {
  Story,
  StoryCandidate,
  StoryCitationDescription,
  StoryRevision,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  userHref,
  workspaceHref,
  workspaceInboxItemHref,
  workspaceInboxRevisionHref,
  workspaceStoriesHref,
  workspaceStoryCandidateConfirmHref,
  workspaceStoryCandidateHref,
  workspaceStoryCandidateRejectHref,
  workspaceStoryCandidatesHref,
  workspaceStoryHref,
  workspaceStoryRevisionHref,
  workspaceStoryRevisionsHref,
} from '../links';

export interface StoryCitationModel {
  _links: Record<string, Link>;
  inboxItemId: string;
  inboxRevisionId: string;
  inboxRevisionNumber: number;
  contentSha256: string;
  locator: string;
}

export interface StoryCandidateModel {
  _links: Record<string, Link>;
  id: string;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: string;
  citations: StoryCitationModel[];
  contentSha256: string;
  status: string;
  version: number;
  proposedByUserId: string;
  proposedAt: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  confirmedStoryId: string | null;
  confirmedRevisionId: string | null;
}

export function storyCandidateModel(
  candidate: StoryCandidate,
): StoryCandidateModel {
  const candidateId = candidate.identity();
  const description = candidate.description();
  const workspaceId = description.workspace.id();
  const links: Record<string, Link> = {
    self: link(workspaceStoryCandidateHref(workspaceId, candidateId)),
    workspace: link(workspaceHref(workspaceId)),
    collection: link(workspaceStoryCandidatesHref(workspaceId)),
    'proposed-by': link(userHref(description.proposedBy.id())),
  };
  if (description.status === 'pending') {
    links.confirm = link(
      workspaceStoryCandidateConfirmHref(workspaceId, candidateId),
    );
    links.reject = link(
      workspaceStoryCandidateRejectHref(workspaceId, candidateId),
    );
  }
  if (description.decidedBy) {
    links['decided-by'] = link(userHref(description.decidedBy.id()));
  }
  if (description.confirmedStory && description.confirmedRevision) {
    links.story = link(
      workspaceStoryHref(workspaceId, description.confirmedStory.id()),
    );
    links['story-revision'] = link(
      workspaceStoryRevisionHref(
        workspaceId,
        description.confirmedStory.id(),
        description.confirmedRevision.id(),
      ),
    );
  }

  return {
    _links: links,
    id: candidateId,
    title: description.title,
    problem: description.problem,
    role: description.role,
    goal: description.goal,
    value: description.value,
    cognitiveMode: description.cognitiveMode,
    citations: description.citations.map((citation) =>
      storyCitationModel(workspaceId, citation),
    ),
    contentSha256: description.contentSha256,
    status: description.status,
    version: description.version,
    proposedByUserId: description.proposedBy.id(),
    proposedAt: description.proposedAt,
    decidedByUserId: description.decidedBy?.id() ?? null,
    decidedAt: description.decidedAt,
    confirmedStoryId: description.confirmedStory?.id() ?? null,
    confirmedRevisionId: description.confirmedRevision?.id() ?? null,
  };
}

export interface StoryModel {
  _links: Record<string, Link>;
  id: string;
  title: string;
  latestRevisionId: string;
  latestRevisionNumber: number;
  latestScenarioCount: number;
  revisionCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function storyModel(story: Story): StoryModel {
  const storyId = story.identity();
  const description = story.description();
  const workspaceId = description.workspace.id();
  return {
    _links: {
      self: link(workspaceStoryHref(workspaceId, storyId)),
      workspace: link(workspaceHref(workspaceId)),
      collection: link(workspaceStoriesHref(workspaceId)),
      revisions: link(workspaceStoryRevisionsHref(workspaceId, storyId)),
      'create-revision': link(
        workspaceStoryRevisionsHref(workspaceId, storyId),
      ),
      'latest-revision': link(
        workspaceStoryRevisionHref(
          workspaceId,
          storyId,
          description.latestRevision.id(),
        ),
      ),
    },
    id: storyId,
    title: description.title,
    latestRevisionId: description.latestRevision.id(),
    latestRevisionNumber: description.latestRevisionNumber,
    latestScenarioCount: description.latestScenarioCount,
    revisionCount: description.revisionCount,
    version: description.version,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
}

export interface StoryScenarioModel {
  id: string;
  title: string;
  given: string[];
  when: string;
  then: string[];
}

export interface StoryRevisionModel {
  _links: Record<string, Link>;
  id: string;
  revisionNumber: number;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: string;
  citations: StoryCitationModel[];
  scenarios: StoryScenarioModel[];
  contentSha256: string;
  sourceCandidateId: string | null;
  createdByUserId: string;
  createdAt: string;
}

export function storyRevisionModel(
  workspaceId: string,
  revision: StoryRevision,
): StoryRevisionModel {
  const revisionId = revision.identity();
  const description = revision.description();
  const storyId = description.story.id();
  const links: Record<string, Link> = {
    self: link(workspaceStoryRevisionHref(workspaceId, storyId, revisionId)),
    story: link(workspaceStoryHref(workspaceId, storyId)),
    collection: link(workspaceStoryRevisionsHref(workspaceId, storyId)),
    workspace: link(workspaceHref(workspaceId)),
    'created-by': link(userHref(description.createdBy.id())),
  };
  if (description.sourceCandidate) {
    links['source-candidate'] = link(
      workspaceStoryCandidateHref(
        workspaceId,
        description.sourceCandidate.id(),
      ),
    );
  }
  return {
    _links: links,
    id: revisionId,
    revisionNumber: description.revisionNumber,
    title: description.title,
    problem: description.problem,
    role: description.role,
    goal: description.goal,
    value: description.value,
    cognitiveMode: description.cognitiveMode,
    citations: description.citations.map((citation) =>
      storyCitationModel(workspaceId, citation),
    ),
    scenarios: description.scenarios.map((scenario) => ({ ...scenario })),
    contentSha256: description.contentSha256,
    sourceCandidateId: description.sourceCandidate?.id() ?? null,
    createdByUserId: description.createdBy.id(),
    createdAt: description.createdAt,
  };
}

function storyCitationModel(
  workspaceId: string,
  citation: StoryCitationDescription,
): StoryCitationModel {
  const inboxItemId = citation.inboxItem.id();
  const inboxRevisionId = citation.inboxRevision.id();
  return {
    _links: {
      item: link(workspaceInboxItemHref(workspaceId, inboxItemId)),
      revision: link(
        workspaceInboxRevisionHref(workspaceId, inboxItemId, inboxRevisionId),
      ),
    },
    inboxItemId,
    inboxRevisionId,
    inboxRevisionNumber: citation.inboxRevisionNumber,
    contentSha256: citation.contentSha256,
    locator: citation.locator,
  };
}
