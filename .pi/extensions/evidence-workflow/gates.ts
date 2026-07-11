import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { collectArtifacts, ensureProjectDirs } from './artifacts';
import { nextPhase, PHASE_META } from './phases';
import { readState, writeState } from './state';
import type { MetaState, Phase } from './types';

export function isGateAnswered(cwd: string, gateId: string): boolean {
  const file = join(cwd, 'artifacts', 'gates', `${gateId}.md`);
  if (!existsSync(file)) return false;
  const text = readFileSync(file, 'utf8');
  return text.includes('人类回答') && !text.includes('在此填写');
}

export function answerGate(
  cwd: string,
  gateId: string,
  decision: string,
): { gatePath: string; answered: boolean } {
  const gatePath = join(cwd, 'artifacts', 'gates', `${gateId}.md`);
  if (!existsSync(gatePath))
    throw new Error(`Gate file not found: ${gatePath}`);
  const current = readFileSync(gatePath, 'utf8');
  const next = current.includes('<!-- 在此填写 -->')
    ? current.replace('<!-- 在此填写 -->', decision)
    : `${current.trim()}\n\n## Decision\n${decision}\n`;
  writeFileSync(gatePath, next);
  return { gatePath, answered: isGateAnswered(cwd, gateId) };
}

export function generateGate(
  cwd: string,
  phase: Exclude<Phase, 'complete'>,
  artifacts: string[],
  summary = '',
): string {
  ensureProjectDirs(cwd);
  const meta = PHASE_META[phase];
  const file = join(cwd, 'artifacts', 'gates', `${meta.gateId}.md`);
  const today = new Date().toISOString().slice(0, 10);
  const artifactList = artifacts.length
    ? artifacts.map((a) => `- [${a}](../../${a})`).join('\n')
    : meta.outputs.map((a) => `- ${a}`).join('\n');
  const text = `# Gate: ${meta.gateTitle} (${meta.gateId})

## 状态
⏳ 待审核 · 由 Evidence Workflow extension 于 ${today} 自动生成

## 当前阶段
- Phase: ${phase}
- Title: ${meta.title}

## 当前工件
${artifactList}

## 自动摘要
${summary || '请审阅本阶段输出，确认是否进入下一阶段。'}

## 待人类决策

### 审核意见
- [ ] 通过，进入下一阶段
- [ ] 驳回，需修改（请在下方说明）
- [ ] 需要补充 [请描述]

**人类回答**：
<!-- 在此填写 -->

---

可直接编辑本文件后再次运行，也可执行：

\`/evidence-gate 通过，进入下一阶段\`
`;
  writeFileSync(file, text);
  return relative(cwd, file);
}

export function completePhase(
  cwd: string,
  phase: Exclude<Phase, 'complete'>,
  summary = '',
): MetaState {
  const current = readState(cwd);
  const artifacts = collectArtifacts(cwd);
  const mode = current.gate_config[phase] ?? 'auto';
  const shouldGate =
    mode === 'review' ||
    mode === 'override' ||
    (mode === 'review_if' && current.failures > 0);
  const newPendingGate = shouldGate ? PHASE_META[phase].gateId : null;
  if (shouldGate) generateGate(cwd, phase, artifacts, summary);
  return writeState(cwd, {
    ...current,
    phase: nextPhase(phase),
    round: 0,
    pending_gate: newPendingGate,
    failures: 0,
    artifacts,
    pi: {
      enabled: true,
      version: 3,
      ...(current.pi ?? {}),
      last_completed_phase: phase,
      last_run_at: new Date().toISOString(),
    },
  });
}
