import { useEffect, useId, useRef, useState } from 'react';
import { Badge, Button } from '@evidence-poc/desktop-ui-kit';
import type {
  WhatIfChallenge,
  WhatIfChallengeCategory,
} from '@evidence-poc/desktop-contracts/story';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';

function friendlyWhatIfError(error: string): string {
  if (error.includes('No relevant completion/breach rule is modeled'))
    return '当前步骤没有可用的完成或违约规则。请刷新放映，或回到画布确认规则。';
  if (error.includes('业务步骤已变化'))
    return '业务步骤已变化，请刷新放映后重试。';
  if (error.includes('Hypothesis clock precedes its dependency facts'))
    return '假设时点不能早于上游凭证的发生时点。';
  if (error.includes('Hypothesis cannot override unknown or derived field'))
    return '只能修改当前凭证中已声明、可直接输入的字段。';
  if (error.includes('requires one') && error.includes('example, found'))
    return '当前示例未能为规则提供唯一的关联凭证。请检查业务流中的依赖。';
  return '未能完成推演。请明确假设后重试，或检查 AI 配置。';
}

const categories = {
  overdue: {
    label: '时效逾期',
    style: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  deficit: {
    label: '交付缺额',
    style: 'border-red-300 bg-red-50 text-red-900',
  },
  condition_gap: {
    label: '前提缺失',
    style: 'border-blue-300 bg-blue-50 text-blue-900',
  },
  actor_mismatch: {
    label: '主体不符',
    style: 'border-violet-300 bg-violet-50 text-violet-900',
  },
} satisfies Record<WhatIfChallengeCategory, { label: string; style: string }>;

const WhatIfForm = ({
  playback,
  speculative = false,
  challenges,
  aiConfigured = true,
}: {
  playback: StoryPlaybackController;
  speculative?: boolean;
  challenges?: readonly WhatIfChallenge[];
  aiConfigured?: boolean;
}) => {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [{ question, picked }, setQuestion] = useState<{
    question: string;
    picked?: WhatIfChallenge;
  }>({ question: '' });
  const { sandbox } = playback;
  const result = sandbox?.result;
  return (
    <>
      <form
        aria-labelledby={`${id}-label`}
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void playback.askWhatIf(question, {
            allowSpeculative: speculative,
            challenge: picked,
          });
        }}
      >
        {challenges?.length ? (
          <fieldset className="min-w-0">
            <legend className="mb-1 font-medium">推荐异常推演</legend>
            <div className="flex flex-wrap gap-2">
              {challenges.map((card) => (
                <Button
                  key={card.id}
                  type="button"
                  className={`h-auto min-h-12 min-w-0 flex-auto flex-col items-start gap-1 whitespace-normal break-words px-2 py-1.5 text-left ${categories[card.category].style}`}
                  onClick={() => {
                    playback.clearWhatIf();
                    setQuestion({ question: card.question, picked: card });
                    textarea.current?.focus();
                  }}
                >
                  <span className="font-semibold">
                    {categories[card.category].label} · {card.label}
                  </span>
                  <span className="text-evidence-ink">{card.question}</span>
                </Button>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label id={`${id}-label`} htmlFor={id} className="font-medium">
          假设问题
        </label>
        <p id={`${id}-help`} className="text-evidence-muted">
          {speculative
            ? 'AI 只讨论可能的影响；不判定完成或违约，不作为验收依据。'
            : aiConfigured
              ? '更改当前凭证的输入值或判定时点。模型规则负责判定，AI 负责解释；假设不会保存。'
              : '选择推荐问题可在本地推演。配置大模型后可推演自行编写的问题。'}
        </p>
        <textarea
          id={id}
          ref={textarea}
          name="question"
          aria-describedby={`${id}-help`}
          value={question}
          onChange={(event) => {
            playback.clearWhatIf();
            setQuestion({ question: event.target.value });
          }}
          maxLength={4000}
          rows={3}
          required
          className="w-full resize-y rounded border border-evidence-line bg-white p-2"
        />
        <div>
          <Button
            type="submit"
            variant="default"
            disabled={
              sandbox?.loading ||
              !question.trim() ||
              (!aiConfigured && !picked?.hypothesisDraft)
            }
          >
            {speculative ? '生成 AI 推想' : '推演假设'}
          </Button>
        </div>
      </form>
      {sandbox?.error ? (
        <p role="alert" className="text-red-700">
          {friendlyWhatIfError(sandbox.error)}
        </p>
      ) : null}
      <div
        role="status"
        className={sandbox?.loading || result ? undefined : 'sr-only'}
      >
        {sandbox?.loading
          ? speculative
            ? '正在生成推想…'
            : '正在推演…'
          : null}
        {result ? (
          <div className="flex flex-col gap-2 border-t border-evidence-line pt-3">
            {result.isSpeculative ? (
              <Badge variant="role">AI 临时推想 · 非规则判定</Badge>
            ) : null}
            <p className="whitespace-pre-wrap break-words leading-6">
              {result.businessImpactExplanation}
            </p>
            {!result.isSpeculative ? (
              <>
                <ul className="flex flex-col gap-1 text-evidence-muted">
                  {result.ruleOutcomes.map((outcome) => (
                    <li key={outcome.ruleId}>
                      {outcome.ruleId}：
                      {outcome.result ? '条件成立' : '条件不成立'}
                    </li>
                  ))}
                </ul>
                <p className="text-evidence-muted">
                  推演不是审批或发布授权；条件成立也可能表示触发违约。
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
};

const MissingRulesPanel = ({
  playback,
  aiConfigured,
}: {
  playback: StoryPlaybackController;
  aiConfigured: boolean;
}) => {
  const [exploring, setExploring] = useState(
    Boolean(
      playback.sandbox?.loading || playback.sandbox?.result?.isSpeculative,
    ),
  );
  const controlsId = useId();
  return (
    <>
      <p>当前步骤尚未建模相关的完成或违约规则，无法进行规则判定。</p>
      <div className="flex flex-wrap gap-2">
        {aiConfigured ? (
          <Button
            type="button"
            aria-expanded={exploring}
            aria-controls={controlsId}
            onClick={() => {
              playback.clearWhatIf();
              setExploring(!exploring);
            }}
          >
            {exploring ? '退出 AI 临时推想' : '开启 AI 临时推想'}
          </Button>
        ) : null}
      </div>
      <div id={controlsId} hidden={!exploring || !aiConfigured}>
        {exploring && aiConfigured ? (
          <div className="flex flex-col gap-2">
            <WhatIfForm playback={playback} speculative />
          </div>
        ) : null}
      </div>
    </>
  );
};

export const WhatIfSection = ({
  playback,
  aiConfigured,
}: {
  playback: StoryPlaybackController;
  aiConfigured: boolean;
}) => {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const jumpTarget = useRef<number | undefined>(undefined);
  const { whatIfCapability: capability, anchoredStep: step } = playback;
  const sequence = step?.sequence;
  useEffect(() => {
    if (jumpTarget.current === undefined || jumpTarget.current !== sequence)
      return;
    jumpTarget.current = undefined;
    heading.current?.focus();
  }, [sequence]);
  if (!capability || !step) return null;
  const key = `${playback.activeFlowId}:${step.sequence}:${step.stepHash}:${aiConfigured}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-lg border border-evidence-line bg-evidence-surface p-3 text-evidence-ink"
    >
      <h3 id={headingId} tabIndex={-1} ref={heading} className="font-medium">
        What-If 业务沙盘
      </h3>
      {capability.status === 'non_fulfillment_stage' ? (
        <>
          <p>
            {step.entityKind === 'contract'
              ? '合同步骤记录双方的约定，不直接判定某项履约是否完成或违约。'
              : '当前步骤不是履约凭证，不适用业务沙盘。'}
          </p>
          {capability.next ? (
            <div>
              <p className="mb-2 text-evidence-muted">
                {capability.next.hasRules
                  ? '可切换到本流程中已有判定规则的履约步骤。'
                  : '本流程的后续履约步骤暂无判定规则，可先查看具体凭证。'}
              </p>
              <Button
                type="button"
                className="h-auto min-h-7 whitespace-normal text-left"
                onClick={() => {
                  if (!capability.next) return;
                  jumpTarget.current = capability.next.sequence;
                  playback.jumpToStep(capability.next.sequence);
                }}
              >
                前往「{capability.next.entityLabel}」
              </Button>
            </div>
          ) : (
            <p className="text-evidence-muted">本流程暂无后续履约步骤。</p>
          )}
        </>
      ) : capability.status === 'missing_rules' ? (
        <MissingRulesPanel
          key={key}
          playback={playback}
          aiConfigured={aiConfigured}
        />
      ) : aiConfigured || capability.challenges.length ? (
        <WhatIfForm
          key={key}
          playback={playback}
          challenges={capability.challenges}
          aiConfigured={aiConfigured}
        />
      ) : (
        <p>当前步骤已有判定规则。配置大模型后可输入假设并查看解释。</p>
      )}
    </section>
  );
};
