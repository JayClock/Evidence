import { describe, expect, it } from 'vitest';
import {
  nextPhase,
  PHASE_META,
  PHASE_ORDER,
  phaseSpecificInstructions,
} from './phases';

describe('phases', () => {
  it('orders delivery phases through learning', () => {
    expect(PHASE_ORDER).toContain('learn');
    expect(nextPhase('review')).toBe('learn');
    expect(nextPhase('learn')).toBe('complete');
  });

  it('uses canonical test processes and emits only scenario architecture evidence', () => {
    expect(PHASE_META.architecture.inputs).toContain(
      'engineering/evidence-workflow/test-processes/',
    );
    expect(PHASE_META.architecture.outputs).toContain(
      'artifacts/03-architecture/scenario-context-map.json',
    );
    expect(phaseSpecificInstructions('architecture')).toContain(
      'scenario-context-map.json',
    );
    expect(phaseSpecificInstructions('coding')).toContain(
      'evidence_workflow_select_test_process',
    );
  });
});
