import type { IterationResourceData } from '@evidence/api-client';
import { Badge } from '@evidence/ui';

const steps = [
  { label: 'Problem and Intake', detail: 'Intake 与 Kickoff authority' },
  { label: 'Scenario and Model', detail: 'TQA、Scenario 与模型处置' },
  { label: 'Tasking', detail: 'Candidate 与 Desk Check' },
  { label: 'Pair', detail: '逐 TEST、质量门与编码审批' },
  { label: 'Showcase', detail: 'Q2、观察、Review 与决定' },
  { label: 'Run and Respond', detail: '知识响应与 next Probe' },
] as const;

type AuthorityStepState = 'done' | 'current' | 'upcoming';

export function DeliveryAuthorityProgress({
  iteration,
}: {
  iteration: Pick<IterationResourceData, 'lifecycle' | 'loop' | 'stage'>;
}) {
  const currentIndex = authorityStepIndex(iteration);

  return (
    <div className="h-[3.625rem] shrink-0 overflow-x-auto px-4 pb-[0.6875rem]">
      <ol
        aria-label="Iteration 知识位置"
        className="grid h-[2.9375rem] min-w-[60rem] grid-cols-6 overflow-hidden rounded-lg border bg-card"
      >
        {steps.map((step, index) => {
          const state = stepState(index, currentIndex);
          return (
            <li
              className="flex min-w-0 items-center gap-2 border-r px-2 last:border-r-0 data-[state=current]:bg-status-info-soft data-[state=done]:bg-status-verified-soft"
              data-state={state}
              key={step.label}
            >
              <Badge variant={stepBadgeVariant(state)}>
                {state === 'done' ? '✓' : index + 1}
              </Badge>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium">
                  {step.label}
                </span>
                <span className="truncate text-[0.6875rem] text-muted-foreground">
                  {step.detail}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function iterationStageLabel(
  iteration: Pick<IterationResourceData, 'lifecycle' | 'loop' | 'stage'>,
): string {
  if (iteration.lifecycle === 'halted') return 'Iteration 已停止';
  if (iteration.lifecycle === 'provisioning') return '正在准备本地工作区';
  if (iteration.lifecycle === 'provisioning_failed') return '本地准备失败';

  const key = `${iteration.loop}/${iteration.stage}`;
  return stageLabels[key] ?? `${iteration.loop} / ${iteration.stage}`;
}

export function shortHash(value: string, start = 12, end = 8): string {
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function authorityStepIndex(
  iteration: Pick<IterationResourceData, 'loop' | 'stage'>,
): number {
  if (iteration.loop === 'kickoff') return 0;
  if (iteration.loop === 'understand') return 1;
  if (iteration.loop === 'tasking') return 2;
  if (iteration.loop === 'pair') return 3;
  if (iteration.loop === 'showcase') return 4;
  if (iteration.loop === 'respond') {
    return iteration.stage === 'accepted' ? steps.length : 5;
  }
  return steps.length;
}

function stepState(index: number, currentIndex: number): AuthorityStepState {
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'current';
  return 'upcoming';
}

function stepBadgeVariant(state: AuthorityStepState) {
  if (state === 'current') return 'info' as const;
  if (state === 'done') return 'verified' as const;
  return 'outline' as const;
}

const stageLabels: Record<string, string> = {
  'kickoff/candidate_review': 'Kickoff · 候选审查',
  'kickoff/candidate_drafting': 'Kickoff · 替代提案',
  'understand/tqa': 'Understand · TQA',
  'understand/scenario_review': 'Understand · Scenario 审查',
  'understand/modeling': 'Understand · 模型判断',
  'tasking/drafting': 'Tasking · 计划拟定',
  'tasking/desk_check': 'Tasking · Desk Check',
  'tasking/knowledge_gap': 'Tasking · 知识缺口',
  'tasking/approved': 'Tasking · Plan 已批准',
  'pair/plan_confirmed': 'Pair · Plan 已确认',
  'pair/test_written': 'Pair · TEST 已写入',
  'pair/red_observed': 'Pair · Red 已观察',
  'pair/implementation_written': 'Pair · 实现已写入',
  'pair/green_observed': 'Pair · Green 已观察',
  'pair/refactored': 'Pair · Refactor 已完成',
  'pair/quality_gate_failed': 'Pair · 质量门失败',
  'pair/quality_gates_passed': 'Pair · 等待编码审批',
  'pair/exception': 'Pair · 异常待决定',
  'pair/approved': 'Pair · 编码已批准',
  'showcase/setup': 'Showcase · Q2 重跑',
  'showcase/reviewing': 'Showcase · 产品观察与评价',
  'showcase/decision': 'Showcase · 等待人工决定',
  'showcase/accepted': 'Showcase · 已接受',
  'showcase/revised': 'Showcase · 已路由修订',
  'showcase/rejected': 'Showcase · 已拒绝',
  'respond/drafting': 'Respond · Learner 提案',
  'respond/decision': 'Respond · 等待人工决定',
  'respond/accepted': 'Respond · Iteration 已完成',
};
