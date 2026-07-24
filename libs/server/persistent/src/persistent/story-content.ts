import { createHash } from 'node:crypto';
import {
  normalizeStoryCandidateInput,
  normalizeStoryRevisionInput,
  type StoryCandidateInput,
  type StoryRevisionInput,
} from '@evidence/server-domain';

export interface HashedStoryCandidateInput {
  candidate: StoryCandidateInput;
  contentSha256: string;
}

export interface HashedStoryRevisionInput {
  revision: StoryRevisionInput;
  contentSha256: string;
}

export function hashStoryCandidateInput(
  input: StoryCandidateInput,
): HashedStoryCandidateInput {
  const candidate = normalizeStoryCandidateInput(input);
  const canonical = JSON.stringify({
    title: candidate.title,
    problem: candidate.problem,
    role: candidate.role,
    goal: candidate.goal,
    value: candidate.value,
    cognitiveMode: candidate.cognitiveMode,
    citations: candidate.citations.map((citation) => ({
      inboxItemId: citation.inboxItemId,
      inboxRevisionId: citation.inboxRevisionId,
      contentSha256: citation.contentSha256,
      locator: citation.locator,
    })),
  });
  return {
    candidate,
    contentSha256: sha256(canonical),
  };
}

export function hashStoryRevisionInput(
  input: StoryRevisionInput,
): HashedStoryRevisionInput {
  const revision = normalizeStoryRevisionInput(input);
  const canonical = JSON.stringify({
    title: revision.title,
    problem: revision.problem,
    role: revision.role,
    goal: revision.goal,
    value: revision.value,
    cognitiveMode: revision.cognitiveMode,
    citations: revision.citations.map((citation) => ({
      inboxItemId: citation.inboxItemId,
      inboxRevisionId: citation.inboxRevisionId,
      contentSha256: citation.contentSha256,
      locator: citation.locator,
    })),
    scenarios: revision.scenarios.map((scenario) => ({
      title: scenario.title,
      given: scenario.given,
      when: scenario.when,
      then: scenario.then,
    })),
  });
  return {
    revision,
    contentSha256: sha256(canonical),
  };
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
