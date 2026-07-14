import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  IDLE_STATE,
  nextPhase,
  PHASE_META,
  PHASE_ORDER,
  phaseSpecificInstructions,
} from './phase-catalog';

describe('v2 feedback loop phases', () => {
  it('uses the short single-Story feedback loop', () => {
    expect(PHASE_ORDER).toEqual([
      'idle',
      'kickoff',
      'discover',
      'model',
      'design',
      'build',
      'showcase',
      'learn',
      'complete',
    ]);
    expect(nextPhase('showcase')).toBe('learn');
    expect(nextPhase('learn')).toBe('complete');
  });

  it('starts Issue-backed iterations at Kickoff and checkouts at idle', () => {
    expect(DEFAULT_STATE.phase).toBe('kickoff');
    expect(IDLE_STATE).toMatchObject({ iteration_id: null, phase: 'idle' });
  });

  it('uses human feedback only at Kickoff, Model, and Showcase', () => {
    expect(DEFAULT_STATE.gate_config).toEqual({
      kickoff: 'review',
      discover: 'auto',
      model: 'review',
      design: 'auto',
      build: 'auto',
      showcase: 'review',
      learn: 'auto',
    });
  });

  it('merges clarification/specification and architecture/planning', () => {
    expect(PHASE_META.discover.outputs).toEqual([
      'artifacts/02-discovery/discovery.md',
      'artifacts/02-discovery/examples/',
    ]);
    expect(PHASE_META.design.outputs).toEqual([
      'artifacts/04-design/delivery-plan.md',
      'artifacts/04-design/scenario-context-map.json',
    ]);
    expect(phaseSpecificInstructions('discover')).toContain(
      '合并澄清、示例规格化和就绪检查',
    );
  });

  it('does not require empty architecture or backlog placeholder artifacts', () => {
    const outputs = Object.values(PHASE_META).flatMap(({ outputs }) => outputs);
    expect(outputs).not.toContain(
      'artifacts/03-architecture/architecture-decisions.md',
    );
    expect(outputs).not.toContain('artifacts/04-planning/sprint-plan.md');
  });
});
