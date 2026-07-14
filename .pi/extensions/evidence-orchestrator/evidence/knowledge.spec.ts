import { afterEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_KNOWLEDGE_PATHS,
  validateCanonicalKnowledge,
  validateKnowledgePromotion,
  validateScenarioContextMap,
} from './knowledge';
import { PHASE_META } from '../workflow/phase-catalog';
import { cleanupWorkspaces, workspace, write } from '../tests/support';

afterEach(cleanupWorkspaces);

const PROCESS = {
  version: 1,
  id: 'typescript-web-feature',
  applies_to: {
    runtime: 'typescript',
    functional_contexts: ['web-feature'],
  },
  steps: [
    {
      id: 'q1',
      quadrant: 'Q1',
      functional_context: 'web-feature',
      test_double: 'stub',
      task: 'Component behavior.',
    },
    {
      id: 'q2',
      quadrant: 'Q2',
      functional_context: 'web-feature',
      test_double: 'real',
      task: 'Acceptance behavior.',
    },
  ],
  quality_gates: ['pnpm test'],
};

function contextMap(scenarios = 1): object {
  return {
    version: 1,
    scenarios: Array.from({ length: scenarios }, (_, index) => ({
      story_id: 'US-001',
      scenario_id: `SC-${String(index + 1).padStart(3, '0')}`,
      runtimes: [
        {
          runtime: 'typescript',
          functional_contexts: ['web-feature'],
          q1_tests: ['component behavior'],
          q2_tests: ['rendered acceptance scenario'],
          test_doubles: ['stub'],
          candidate_process_ids: ['typescript-web-feature'],
        },
      ],
    })),
  };
}

describe('canonical working knowledge', () => {
  it('keeps product knowledge as input and emits only current Design evidence', () => {
    expect(PHASE_META.kickoff.inputs).toContain(
      'docs/product/business-context.md',
    );
    expect(PHASE_META.design.outputs).toEqual([
      'artifacts/04-design/delivery-plan.md',
      'artifacts/04-design/scenario-context-map.json',
    ]);
  });

  it('requires every canonical knowledge document including delivery principles', () => {
    const cwd = workspace();
    expect(() => validateCanonicalKnowledge(cwd)).toThrow(
      'Canonical working knowledge is missing',
    );
    for (const path of CANONICAL_KNOWLEDGE_PATHS) write(cwd, path, 'knowledge');
    expect(() => validateCanonicalKnowledge(cwd)).not.toThrow();
  });

  it('allows no knowledge promotion when no candidate knowledge changed', () => {
    const cwd = workspace();
    write(
      cwd,
      'promotion.json',
      JSON.stringify({ version: 1, promotions: [] }),
    );
    expect(() =>
      validateKnowledgePromotion(cwd, `${cwd}/promotion.json`),
    ).not.toThrow();
  });

  it('requires promoted knowledge to name an existing canonical target', () => {
    const cwd = workspace();
    write(cwd, 'docs/product/business-context.md', '# context\n');
    write(
      cwd,
      'promotion.json',
      JSON.stringify({
        version: 1,
        promotions: [
          {
            source: 'artifacts/02-discovery/discovery.md',
            decision: 'promoted',
            target: 'docs/product/business-context.md',
            reason: 'Validated in Showcase.',
          },
        ],
      }),
    );
    expect(() =>
      validateKnowledgePromotion(cwd, `${cwd}/promotion.json`),
    ).not.toThrow();
  });

  it('requires exactly one designed Scenario and one candidate process', () => {
    const cwd = workspace();
    write(
      cwd,
      'engineering/evidence-orchestrator/runtime-contexts.json',
      JSON.stringify({ version: 1, runtimes: { typescript: ['web-feature'] } }),
    );
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/typescript.json',
      JSON.stringify(PROCESS),
    );
    write(cwd, 'scenario.json', JSON.stringify(contextMap()));
    expect(() =>
      validateScenarioContextMap(cwd, `${cwd}/scenario.json`),
    ).not.toThrow();

    write(cwd, 'scenario.json', JSON.stringify(contextMap(2)));
    expect(() =>
      validateScenarioContextMap(cwd, `${cwd}/scenario.json`),
    ).toThrow('exactly one active delivery Scenario');
  });
});
