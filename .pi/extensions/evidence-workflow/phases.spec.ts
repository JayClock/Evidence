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

  it('requires machine-readable test processes and selection in the relevant phases', () => {
    expect(PHASE_META.architecture.outputs).toContain(
      'artifacts/03-architecture/test-processes/',
    );
    expect(phaseSpecificInstructions('architecture')).toContain('JSON');
    expect(phaseSpecificInstructions('coding')).toContain(
      'evidence_workflow_select_test_process',
    );
  });
});
