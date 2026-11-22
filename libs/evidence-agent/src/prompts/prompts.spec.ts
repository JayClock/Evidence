import { describe, expect, it } from 'vitest';
import { evidenceToolNames } from '../tools/evidenceTools.js';
import {
  CLARIFICATION_PROMPT,
  EVIDENCE_SYSTEM_PROMPT,
  STORMING_PROMPT,
  WHAT_IF_PROMPT,
  WORKFLOW_PROMPT,
} from './index.js';

const registeredName = /\b[a-z]+(?:_[a-z]+)+\b/g;

describe('evidence modeling instructions', () => {
  it('uses registered operators and prioritizes business clarification over data enrichment', () => {
    for (const prompt of [
      STORMING_PROMPT,
      CLARIFICATION_PROMPT,
      WHAT_IF_PROMPT,
      WORKFLOW_PROMPT,
    ]) {
      for (const name of prompt.match(registeredName) ?? []) {
        expect(evidenceToolNames).toContain(name);
      }
    }
    expect(EVIDENCE_SYSTEM_PROMPT).toContain(CLARIFICATION_PROMPT);
    expect(STORMING_PROMPT).toContain('不写资料出处或摘录');
    for (const businessOperator of [
      'link_proposal_to_rfp',
      'split_evidence_to_pair',
      'bind_party_role',
      'identify_subject_matter',
      'roleify_and_invert_dependency',
    ]) {
      expect(CLARIFICATION_PROMPT.indexOf(businessOperator)).toBeGreaterThan(
        -1,
      );
      expect(CLARIFICATION_PROMPT.indexOf(businessOperator)).toBeLessThan(
        CLARIFICATION_PROMPT.indexOf('bind_key_data_source'),
      );
    }
    expect(WORKFLOW_PROMPT).toContain('不强制顺序');
  });

  it('distinguishes a hypothesis, an authorized outcome and delivery', () => {
    expect(CLARIFICATION_PROMPT).toContain('点击打开只读');
    expect(WHAT_IF_PROMPT).toContain('假设不是业务事实');
    expect(WHAT_IF_PROMPT).toContain('处理方式并授权时');
    expect(WHAT_IF_PROMPT).toContain('这项补偿不履行会怎样');
    expect(WHAT_IF_PROMPT).toContain('不猜测诉讼');
    expect(WORKFLOW_PROMPT).toContain('业务缺口不是保存的阻塞条件');
    expect(WORKFLOW_PROMPT).toContain('真实 HTTP 验收');
  });
});
