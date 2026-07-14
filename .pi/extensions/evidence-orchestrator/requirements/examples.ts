import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { artifactPath } from '../workflow/iteration-paths';
import { readState } from '../workflow/state-store';
import type { WorkflowState } from '../workflow/types';
import { singleStoryId } from './story-cards';

const EXAMPLE_FILE = /^(US-\d{3,})-(SC-\d{3,})\.md$/;

export interface AcceptanceExampleId {
  storyId: string;
  scenarioId: string;
  fileName: string;
}

export function acceptanceExamples(
  cwd: string,
  state: WorkflowState = readState(cwd),
): AcceptanceExampleId[] {
  const directory = artifactPath(cwd, state, 'artifacts/02-discovery/examples');
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && EXAMPLE_FILE.test(entry.name))
    .map((entry) => {
      const match = EXAMPLE_FILE.exec(entry.name);
      return {
        storyId: match?.[1] ?? '',
        scenarioId: match?.[2] ?? '',
        fileName: entry.name,
      };
    })
    .filter(({ fileName }) => statSync(`${directory}/${fileName}`).size > 0)
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}

/** Validate Confirmation examples for the iteration's sole Story. */
export function validateAcceptanceExamples(
  cwd: string,
  state: WorkflowState = readState(cwd),
): void {
  const storyId = singleStoryId(cwd, state);
  const examples = acceptanceExamples(cwd, state);
  if (examples.length === 0) {
    throw new Error(
      `Discover must produce at least one ${storyId}-SC-xxx.md acceptance example.`,
    );
  }
  const wrongStory = examples.find((example) => example.storyId !== storyId);
  if (wrongStory) {
    throw new Error(
      `Acceptance example ${wrongStory.fileName} does not belong to the single active Story ${storyId}.`,
    );
  }

  const directory = artifactPath(cwd, state, 'artifacts/02-discovery/examples');
  for (const example of examples) {
    const markdown = readFileSync(`${directory}/${example.fileName}`, 'utf8');
    for (const [name, pattern] of [
      ['Given', /(?:^|\n)(?:#{1,4}\s*)?(?:Given|给定)\b/im],
      ['When', /(?:^|\n)(?:#{1,4}\s*)?(?:When|当)\b/im],
      ['Then', /(?:^|\n)(?:#{1,4}\s*)?(?:Then|那么|则)\b/im],
    ] as const) {
      if (!pattern.test(markdown)) {
        throw new Error(
          `Acceptance example ${example.fileName} is missing ${name}.`,
        );
      }
    }
  }
}
