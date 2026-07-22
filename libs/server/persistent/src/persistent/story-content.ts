import { createHash } from 'node:crypto';
import {
  normalizeStoryCandidateInput,
  type StoryCandidateInput,
} from '@evidence/server-domain';

export interface HashedStoryCandidateInput {
  candidate: StoryCandidateInput;
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
    contentSha256: `sha256:${createHash('sha256').update(canonical).digest('hex')}`,
  };
}
