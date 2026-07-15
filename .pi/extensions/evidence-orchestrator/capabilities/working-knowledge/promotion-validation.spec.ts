import { afterEach, describe, expect, it } from 'vitest';
import {
  validateCanonicalKnowledge,
  validateKnowledgePromotion,
} from './promotion-validation';
import { cleanupWorkspaces, workspace, write } from '../../tests/support';

afterEach(cleanupWorkspaces);

describe('canonical working knowledge', () => {
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

  it('rejects a pre-v2 promotion document from active validation', () => {
    const cwd = workspace();
    const path = `${cwd}/promotion.json`;
    write(
      cwd,
      'promotion.json',
      JSON.stringify({ version: 1, promotions: [] }),
    );

    expect(() => validateKnowledgePromotion(cwd, path)).toThrow(
      'unsupported knowledge-promotion version',
    );
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
});
