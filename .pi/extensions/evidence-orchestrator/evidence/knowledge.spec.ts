import { afterEach, describe, expect, it } from 'vitest';
import {
  validateCanonicalKnowledge,
  validateKnowledgePromotion,
  validateScenarioContextMap,
} from './knowledge';
import { PHASE_META } from '../workflow/phase-catalog';
import { cleanupWorkspaces, workspace, write } from '../tests/support';

afterEach(cleanupWorkspaces);

describe('canonical working knowledge', () => {
  it('keeps stable product, architecture, and DoD knowledge out of iteration outputs', () => {
    expect(PHASE_META.frame.inputs).toEqual(
      expect.arrayContaining([
        'docs/product/personas.md',
        'docs/product/business-context.md',
        'docs/product/user-journeys.md',
        'docs/product/story-map.md',
      ]),
    );
    expect(PHASE_META.frame.outputs).not.toContain(
      'artifacts/01-requirements/personas.md',
    );
    expect(PHASE_META.architecture.outputs).toEqual(
      expect.arrayContaining([
        'artifacts/03-architecture/architecture-decisions.md',
        'artifacts/03-architecture/api-contract-delta.md',
        'artifacts/03-architecture/data-model-delta.md',
        'artifacts/03-architecture/scenario-context-map.json',
      ]),
    );
    expect(PHASE_META.architecture.outputs).not.toContain(
      'artifacts/03-architecture/architecture-style.md',
    );
    expect(PHASE_META.planning.outputs).not.toContain(
      'artifacts/04-planning/product-backlog.md',
    );
    expect(PHASE_META.planning.outputs).not.toContain(
      'artifacts/04-planning/definition-of-done.md',
    );
  });

  it('requires every canonical knowledge document', () => {
    const cwd = workspace();
    expect(() => validateCanonicalKnowledge(cwd)).toThrow(
      'Canonical working knowledge is missing',
    );
    for (const path of [
      'docs/knowledge-governance.md',
      'docs/product/personas.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
      'docs/architecture/context-map.md',
      'docs/architecture/architecture-style.md',
      'docs/architecture/tech-stack.md',
      'docs/architecture/module-structure.md',
      'docs/architecture/test-strategy.md',
      'docs/architecture/test-doubles.md',
      'engineering/evidence-orchestrator/definition-of-done.md',
      'engineering/evidence-orchestrator/runtime-contexts.json',
    ]) {
      write(cwd, path, '# knowledge\n');
    }
    expect(() => validateCanonicalKnowledge(cwd)).not.toThrow();
  });

  it('requires accepted iteration knowledge to name its canonical target', () => {
    const cwd = workspace();
    write(cwd, 'docs/product/business-context.md', '# context\n');
    const path = `${cwd}/promotion.json`;
    write(
      cwd,
      'promotion.json',
      JSON.stringify({
        version: 1,
        promotions: [
          {
            source: 'artifacts/01-requirements/product-context-delta.md',
            decision: 'promoted',
            target: 'docs/product/business-context.md',
            reason: 'Validated by the selected scenario.',
          },
        ],
      }),
    );
    expect(() => validateKnowledgePromotion(cwd, path)).not.toThrow();
  });

  it('allows an empty v2 promotion set only with a concrete reason', () => {
    const cwd = workspace();
    write(cwd, 'manifest.json', '{}');
    write(
      cwd,
      'promotion.json',
      JSON.stringify({
        version: 2,
        no_promotion_reason:
          'This iteration validated product behavior but introduced no reusable working knowledge.',
        promotions: [],
        consistency: {
          story_id: 'US-001',
          scenario_id: 'SC-001',
          git_baseline: 'baseline',
          execution_manifest: 'manifest.json',
          model_paths: [],
          code_paths: ['apps/web/src/feature.ts'],
          consistent: true,
        },
      }),
    );

    expect(() =>
      validateKnowledgePromotion(cwd, `${cwd}/promotion.json`),
    ).not.toThrow();

    write(
      cwd,
      'promotion.json',
      JSON.stringify({
        version: 2,
        promotions: [],
        consistency: {
          story_id: 'US-001',
          scenario_id: 'SC-001',
          git_baseline: 'baseline',
          execution_manifest: 'manifest.json',
          model_paths: [],
          code_paths: [],
          consistent: true,
        },
      }),
    );
    expect(() =>
      validateKnowledgePromotion(cwd, `${cwd}/promotion.json`),
    ).toThrow('no_promotion_reason');
  });

  it('requires promoted v2 knowledge to carry evidence and a human decision', () => {
    const cwd = workspace();
    for (const path of [
      'source.md',
      'scenario.md',
      'showcase.jsonl',
      'manifest.json',
      'docs/architecture/test-strategy.md',
    ]) {
      write(cwd, path, path);
    }
    write(
      cwd,
      'promotion.json',
      JSON.stringify({
        version: 2,
        promotions: [
          {
            source: 'source.md',
            kind: 'architecture',
            decision: 'promoted',
            reason: 'The accepted Scenario exercised this strategy.',
            validation_evidence: [
              'scenario.md',
              'showcase.jsonl',
              'manifest.json',
            ],
            canonical_target: 'docs/architecture/test-strategy.md',
            human_decision: {
              decision: 'promoted',
              reason: 'The evidence is sufficient.',
              confirmed_by: 'human',
              confirmed_at: '2026-01-01T00:00:00.000Z',
            },
          },
        ],
        consistency: {
          story_id: 'US-001',
          scenario_id: 'SC-001',
          git_baseline: 'baseline',
          execution_manifest: 'manifest.json',
          model_paths: [],
          code_paths: ['apps/web/src/feature.ts'],
          consistent: true,
        },
      }),
    );

    expect(() =>
      validateKnowledgePromotion(cwd, `${cwd}/promotion.json`),
    ).not.toThrow();
  });

  it('validates scenario mappings against the shared runtime vocabulary', () => {
    const cwd = workspace();
    write(
      cwd,
      'engineering/evidence-orchestrator/runtime-contexts.json',
      JSON.stringify({
        version: 1,
        runtimes: { typescript: ['web-feature'], rust: ['rust-api'] },
      }),
    );
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/typescript.json',
      JSON.stringify({
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
      }),
    );
    const path = `${cwd}/scenario-context-map.json`;
    write(
      cwd,
      'scenario-context-map.json',
      JSON.stringify({
        version: 1,
        scenarios: [
          {
            story_id: 'US-001',
            scenario_id: 'SC-001',
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
          },
        ],
      }),
    );
    expect(() => validateScenarioContextMap(cwd, path)).not.toThrow();
  });
});
