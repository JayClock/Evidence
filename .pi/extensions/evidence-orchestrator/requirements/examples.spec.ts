import { afterEach, describe, expect, it } from 'vitest';
import { acceptanceExamples, validateAcceptanceExamples } from './examples';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

function withStory(): string {
  const cwd = workspace();
  writeIterationArtifact(cwd, '01-kickoff/story.md', LEAN_STORY_CARD);
  return cwd;
}

describe('acceptance examples', () => {
  it('accepts concrete Given/When/Then for the sole Story', () => {
    const cwd = withStory();
    writeIterationArtifact(
      cwd,
      '02-discovery/examples/US-001-SC-001.md',
      '# US-001 / SC-001\n\nGiven a workspace titled Old\n\nWhen the owner saves New\n\nThen reloading shows New\n',
    );
    expect(acceptanceExamples(cwd, DEFAULT_STATE)).toHaveLength(1);
    expect(() => validateAcceptanceExamples(cwd, DEFAULT_STATE)).not.toThrow();
  });

  it('rejects examples for another Story', () => {
    const cwd = withStory();
    writeIterationArtifact(
      cwd,
      '02-discovery/examples/US-002-SC-001.md',
      'Given x\nWhen y\nThen z\n',
    );
    expect(() => validateAcceptanceExamples(cwd, DEFAULT_STATE)).toThrow(
      'does not belong to the single active Story US-001',
    );
  });
});
