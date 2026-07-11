import { PHASE_META, phaseSpecificInstructions } from './phases';
import { readState } from './state';
import type { Phase } from './types';

export function buildPhasePrompt(
  cwd: string,
  requestedPhase?: string,
  extra = '',
): string {
  const state = readState(cwd);
  const phase = (requestedPhase || state.phase) as Phase;
  if (phase === 'complete') {
    return 'Evidence Workflow pipeline is complete. Inspect artifacts and propose the next product or quality iteration if useful.';
  }
  const meta = PHASE_META[phase];
  return `你正在执行 Evidence Workflow 阶段：${phase} — ${meta.title}。

必须遵守：
1. 使用项目内 Skill：${meta.skill}；必要时读取 .pi/skills/${meta.skill}/SKILL.md。
2. 读取并尊重输入文件，不要凭空编造已有工件。
3. 将输出写入指定工件路径；如果目录不存在，创建目录。
4. 代码阶段必须创建或修改真实 src/ 与 tests/ 文件，不能只写 Markdown 伪代码。
5. 保留 artifacts/ 作为审计日志；可以在 artifacts/05-code/ 写实现说明或评审 notes。
6. 完成后调用 evidence_workflow_complete_phase 工具，phase 必须传入 "${phase}"，summary 简述本阶段完成内容。

输入文件/目录：
${meta.inputs.map((p) => `- ${p}`).join('\n')}

必须产出：
${meta.outputs.map((p) => `- ${p}`).join('\n')}

阶段要求：
${phaseSpecificInstructions(phase)}

额外用户指令：
${extra || '（无）'}
`;
}
