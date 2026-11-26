import { useEffect, useId, useRef, useState } from 'react';
import { Badge, Button } from '@evidence-poc/desktop-ui-kit';
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

const WhatIfForm = ({
  playback,
  speculative = false,
  suggestion,
}: {
  playback: StoryPlaybackController;
  speculative?: boolean;
  suggestion?: string;
}) => {
  const id = useId();
  const [question, setQuestion] = useState('');
  const { sandbox } = playback;
  const result = sandbox?.result;
  return (
    <>
      <form
        aria-labelledby={`${id}-label`}
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void playback.askWhatIf(question, { allowSpeculative: speculative });
        }}
      >
        <label id={`${id}-label`} htmlFor={id} className="font-medium">
          假设问题
        </label>
        <p id={`${id}-help`} className="text-evidence-muted">
          {speculative
            ? 'AI 只讨论可能的影响；不判定完成或违约，不作为验收依据。'
            : '更改当前凭证的输入值或判定时点。模型规则负责判定，AI 负责解释；假设不会保存。'}
        </p>
        <textarea
          id={id}
          name="question"
          aria-describedby={`${id}-help`}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={4000}
          rows={3}
          required
          className="w-full resize-y rounded border border-evidence-line bg-white p-2"
        />
        {suggestion ? (
          <div className="flex flex-col items-start gap-1">
            <p className="text-evidence-muted">示例：{suggestion}</p>
            <Button
              type="button"
              disabled={Boolean(question.trim())}
              onClick={() => setQuestion(suggestion)}
            >
              填入示例问题
            </Button>
          </div>
        ) : null}
        <div>
          <Button
            type="submit"
            variant="default"
            disabled={sandbox?.loading || !question.trim()}
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
            <WhatIfForm
              playback={playback}
              speculative
              suggestion="如果这项交付没有按约发生，哪些业务安排可能受影响？"
            />
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
      ) : aiConfigured ? (
        <WhatIfForm
          key={key}
          playback={playback}
          suggestion={capability.suggestedQuestion}
        />
      ) : (
        <p>当前步骤已有判定规则。配置大模型后可输入假设并查看解释。</p>
      )}
    </section>
  );
};
