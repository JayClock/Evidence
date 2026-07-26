import { createHash } from 'node:crypto';
import {
  normalizeStoryRevisionInput,
  type StoryRevisionInput,
} from '@evidence/server-domain';

export interface HashedStoryRevisionInput {
  revision: StoryRevisionInput;
  contentSha256: string;
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
