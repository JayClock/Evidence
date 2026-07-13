import { describe, expect, it } from 'vitest';
import {
  nextPhase,
  PHASE_META,
  PHASE_ORDER,
  phaseSpecificInstructions,
} from './phase-catalog';

describe('phases', () => {
  it('orders delivery phases through learning', () => {
    expect(PHASE_ORDER).toContain('learn');
    expect(nextPhase('review')).toBe('learn');
    expect(nextPhase('learn')).toBe('complete');
  });

  it('creates selectable story cards during frame', () => {
    expect(PHASE_META.frame.outputs).toContain(
      'artifacts/01-requirements/stories/',
    );
    expect(phaseSpecificInstructions('frame')).toContain('stories/US-xxx.md');
  });

  it('uses canonical test processes and emits only scenario architecture evidence', () => {
    expect(PHASE_META.architecture.inputs).toContain(
      'engineering/evidence-orchestrator/test-processes/',
    );
    expect(PHASE_META.architecture.outputs).toContain(
      'artifacts/03-architecture/scenario-context-map.json',
    );
    expect(phaseSpecificInstructions('architecture')).toContain(
      'scenario-context-map.json',
    );
    expect(phaseSpecificInstructions('coding')).toContain(
      'evidence_orchestrator_select_test_process',
    );
  });
});
