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

  it('creates lean 3C story cards during frame', () => {
    expect(PHASE_META.frame.outputs).toContain(
      'artifacts/01-requirements/stories/',
    );
    const frameInstructions = phaseSpecificInstructions('frame');
    expect(frameInstructions).toContain('stories/US-xxx.md');
    expect(frameInstructions).toContain('Card、Conversation、Confirmation');
    expect(frameInstructions).toContain('角色、可协商的目标和价值');
    expect(frameInstructions).toContain(
      '不得包含元数据表、优先级依据、非目标或预生成的待澄清问题列表',
    );

    const clarifyInstructions = phaseSpecificInstructions('clarify');
    expect(clarifyInstructions).toContain(
      '根据业务上下文、当前故事和澄清历史动态选择',
    );

    const specifyInstructions = phaseSpecificInstructions('specify');
    expect(specifyInstructions).toContain('非目标不是反向验收需求');

    const codingInstructions = phaseSpecificInstructions('coding');
    expect(codingInstructions).toContain(
      '没有对应验收场景的功能，不得生成测试代码',
    );
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
