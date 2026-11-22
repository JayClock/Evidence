import { useEffect, useState } from 'react';
import type { StoryScene } from '@evidence-poc/evidence-agent/browser';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';
import { timelineLabel } from './StoryTimelineControls';

interface StoryDrawerProps {
  playback: StoryPlaybackController;
  dirty?: boolean;
  externalConflict?: boolean;
  aiConfigured?: boolean;
  onConfigureAi?: () => void;
}

const buttonClass =
  'rounded border border-evidence-line px-2 py-1 text-[11px] hover:bg-evidence-hover disabled:opacity-40';

const SceneSheet = ({
  scene,
  ready,
  stale,
  skipAi,
}: {
  scene: StoryScene;
  ready: boolean;
  stale: boolean;
  skipAi: boolean;
}) => {
  const [notice, setNotice] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const canSpeak =
    typeof window.speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined';
  useEffect(() => {
    if (!ready) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    }
    return () => window.speechSynthesis?.cancel();
  }, [scene.narrative, ready]);
  const readAloud = () => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(scene.narrative);
    utterance.lang = 'zh-CN';
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      setNotice('朗读不可用，请尝试复制旁白。');
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('剪贴板不可用');
      await navigator.clipboard.writeText(scene.narrative);
      setNotice('旁白已复制。');
    } catch {
      setNotice('复制失败，请检查剪贴板权限。');
    }
  };
  return (
    <>
      <article
        className="rounded-lg border border-evidence-line bg-evidence-surface p-4"
        aria-label="剧情旁白"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{scene.phaseTitle}</h3>
          <span className="text-[10px] text-evidence-muted">
            {stale
              ? '上一版本 · 请等待更新'
              : skipAi
                ? '模型事实 · 未使用 AI'
                : 'AI 旁白 · 请核对模型事实'}
          </span>
        </div>
        <p className="whitespace-pre-wrap leading-6">{scene.narrative}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={!ready || !canSpeak}
            title={canSpeak ? '朗读当前旁白' : '当前环境不支持朗读'}
            onClick={readAloud}
          >
            {speaking ? '停止朗读' : '朗读旁白'}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!ready}
            onClick={() => void copy()}
          >
            复制旁白
          </button>
          <span role="status" className="text-[11px] text-evidence-muted">
            {notice}
          </span>
        </div>
      </article>
      <article
        aria-label="业务单据"
        className="border border-stone-300 bg-[#fffef9] p-5 text-stone-900 shadow-sm"
      >
        <div className="mb-4 border-b-2 border-stone-700 pb-3 text-center">
          <p className="mb-1 text-[10px] tracking-widest text-stone-500">
            业务示例 · 非真实凭证
          </p>
          <h3 className="text-lg font-semibold tracking-wider">
            {scene.documentCard.title}
          </h3>
        </div>
        <p className="mb-4 text-[11px]">经办方：{scene.actingRoleLabel}</p>
        <dl className="divide-y divide-stone-200 border-y border-stone-300">
          {scene.documentCard.fields.map((field) => (
            <div
              key={field.name}
              className={`grid grid-cols-[minmax(6rem,1fr)_2fr] gap-3 py-3 ${field.keyData ? 'bg-amber-50 font-medium' : ''}`}
            >
              <dt className="px-2">
                {field.label}
                {field.keyData ? (
                  <span className="ml-1 text-[9px] text-amber-800">
                    核心要素
                  </span>
                ) : null}
              </dt>
              <dd className="min-w-0 break-words whitespace-pre-wrap">
                {field.value}
                {field.sourceOrigin ? (
                  <small className="mt-1 block font-normal text-stone-500">
                    来源：{field.sourceOrigin}
                  </small>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
        {scene.documentCard.fields.length === 0 ? (
          <p className="py-3 text-stone-500">该示例尚未声明字段值。</p>
        ) : null}
        {scene.documentCard.basisNotes ? (
          <p className="mt-4 whitespace-pre-wrap text-[11px] text-stone-600">
            {scene.documentCard.basisNotes}
          </p>
        ) : null}
      </article>
      {scene.stateTransitionNotice ? (
        <p className="rounded border border-evidence-line p-3">
          {scene.stateTransitionNotice}
        </p>
      ) : null}
      {scene.pendingSuspense ? (
        <aside
          aria-label="业务缺口"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900"
        >
          {scene.pendingSuspense}
        </aside>
      ) : null}
    </>
  );
};

const WhatIfQuestion = ({
  playback,
}: {
  playback: StoryPlaybackController;
}) => {
  const [question, setQuestion] = useState('');
  return (
    <section
      aria-label="What-If 业务沙盘"
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"
    >
      <h3 className="mb-1 font-medium">What-If 业务沙盘</h3>
      <p className="mb-3 text-[11px] leading-5 text-evidence-muted">
        基于当前步骤临时推演，由原生规则判定、AI
        解释；不会修改模型或保存假设。需要可用的 AI 配置。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void playback.askWhatIf(question);
        }}
      >
        <label htmlFor="story-question" className="sr-only">
          假设问题
        </label>
        <textarea
          id="story-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={4000}
          rows={3}
          placeholder="如果付款金额只有 300 会怎样？"
          className="w-full resize-y rounded border border-evidence-line bg-white p-2 text-[12px]"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="submit"
            className={buttonClass}
            disabled={
              !playback.ready || playback.sandbox?.loading || !question.trim()
            }
          >
            {playback.sandbox?.loading ? '正在推演…' : '推演假设'}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!playback.ready || Boolean(question.trim())}
            onClick={() =>
              setQuestion(
                `如果「${playback.scene?.phaseTitle}」无法按期完成，会影响哪些后续步骤？`,
              )
            }
          >
            填入示例问题
          </button>
        </div>
      </form>
      {playback.sandbox?.error ? (
        <p role="alert" className="mt-3 whitespace-pre-wrap text-red-700">
          {playback.sandbox.error}
        </p>
      ) : null}
      {playback.sandbox?.result ? (
        <div
          role="status"
          className="mt-3 space-y-2 border-t border-evidence-line pt-3"
        >
          <p className="whitespace-pre-wrap leading-6">
            {playback.sandbox.result.businessImpactExplanation}
          </p>
          <ul className="space-y-1 text-[11px] text-evidence-muted">
            {playback.sandbox.result.ruleOutcomes.map((outcome) => (
              <li key={outcome.ruleId}>
                {outcome.ruleId}：{outcome.result ? '条件成立' : '条件不成立'}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-evidence-muted">
            推演不是业务审批或发布授权；条件成立也可能意味着触发违约。
          </p>
        </div>
      ) : null}
    </section>
  );
};

const statusLabel = {
  waiting: '窗口内等待',
  completed: '完成条件成立',
  overdue: '已过截止，未判定违约',
  breached: '违约条件成立',
  unknown: '待定：缺少可求值的约定或输入',
} as const;

const TimelineDetails = ({
  playback,
}: {
  playback: StoryPlaybackController;
}) => {
  const { timeline, currentTime, obligations } = playback;
  if (!timeline || currentTime === undefined) return null;
  return (
    <section
      aria-label="时点履约状态"
      className="flex flex-col gap-2 rounded border border-evidence-line p-3"
    >
      <h3 className="font-medium">
        时点履约状态 · {timelineLabel(timeline, currentTime)}
      </h3>
      <p className="text-[11px] text-evidence-muted">
        {timeline.kind === 'rehearsal'
          ? '假设在 T0 发起且尚无确认，按输入的实际经过小时推演，不推断工作日或合同条款。'
          : '仅用当前示例中在该时点可见的数据预演；缺失或未求出的输入不作推断。'}
      </p>
      {obligations.length === 0 ? <p>该时点没有可预演的履约请求。</p> : null}
      <ul className="flex flex-col gap-2">
        {obligations.map(
          ({
            key,
            label,
            deadline,
            status,
            triggeredRules,
            unknownRules,
            responses,
          }) => (
            <li key={key} className="border-t border-evidence-line pt-2">
              <p>
                <strong>{label}</strong> · {statusLabel[status]}
              </p>
              {deadline === undefined ? null : (
                <p>截止：{timelineLabel(timeline, deadline)}</p>
              )}
              {triggeredRules.length ? (
                <p>
                  成立：{triggeredRules.map(({ label }) => label).join('、')}
                </p>
              ) : null}
              {unknownRules.length ? (
                <p>未能求值：{unknownRules.join('、')}</p>
              ) : null}
              {responses.length ? (
                <p>
                  模型中的处置选项（未发生）：
                  {responses.map(({ label }) => label).join('、')}
                </p>
              ) : null}
            </li>
          ),
        )}
      </ul>
      <p className="text-[11px] text-evidence-muted">
        本地推演，不修改模型，也不执行补偿或救济。
      </p>
    </section>
  );
};

export const StoryDrawer = ({
  playback,
  dirty = false,
  externalConflict = false,
  aiConfigured = true,
  onConfigureAi,
}: StoryDrawerProps) => (
  <section
    aria-label="业务故事"
    aria-busy={playback.loading}
    className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 text-[12px] text-evidence-ink"
  >
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <header>
        <h2 className="text-base font-semibold">
          {playback.rehearsal.active
            ? '履约时钟假设'
            : (playback.projection?.storyTitle ?? '业务流放映')}
        </h2>
        <p className="mt-1 text-[11px] text-evidence-muted">
          {playback.rehearsal.active
            ? '在播放条选择请求并输入假设窗口，不会保存输入。'
            : (playback.projection?.businessGoal ??
              '选择一条业务流，逐步核对单据、责任与业务依据。')}
        </p>
        {dirty ? (
          <p className="mt-2 text-amber-800">当前展示包含未保存的画布修改。</p>
        ) : null}
        {externalConflict ? (
          <p role="alert" className="mt-2 text-amber-800">
            磁盘模型已变化，保留本地未保存修改；当前剧情仍基于画布版本。请先保存或手动重新加载。
          </p>
        ) : null}
      </header>
      {!aiConfigured && !playback.rehearsal.active ? (
        <aside className="rounded border border-evidence-line p-3">
          <p>当前为离线放映。配置大模型后可使用 AI 旁白与 What-If 推演。</p>
          <button type="button" className={buttonClass} onClick={onConfigureAi}>
            配置 Pi 模型
          </button>
        </aside>
      ) : null}
      {playback.loading ? (
        <p role="status" className="text-evidence-muted">
          正在增量更新剧情…
          {playback.scene ? '暂显示上一版本，步进和推演已暂停。' : ''}
        </p>
      ) : null}
      {playback.error ? (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-red-800"
        >
          <p className="whitespace-pre-wrap">{playback.error}</p>
          <p className="mt-1 text-[11px]">
            请检查模型与 AI 配置，或切换「仅模型事实」离线放映。
          </p>
          <button
            type="button"
            className={`${buttonClass} mt-2`}
            onClick={playback.retry}
          >
            重试放映
          </button>
        </div>
      ) : null}
      {!playback.loading &&
      !playback.error &&
      !playback.rehearsal.active &&
      playback.flows.length === 0 ? (
        <p>
          暂无业务流。请为实体的业务示例声明
          test.flow、业务时点和单据依据后再开始放映。
        </p>
      ) : null}
      {playback.ready ? <TimelineDetails playback={playback} /> : null}
      {playback.scene ? (
        <SceneSheet
          key={`${playback.projection?.flowId}:${playback.scene.stepIndex}:${playback.scene.stepHash}:${playback.skipAi}`}
          scene={playback.scene}
          ready={playback.ready}
          stale={playback.stale}
          skipAi={playback.skipAi}
        />
      ) : null}
      {playback.scene && aiConfigured ? (
        <WhatIfQuestion
          key={`${playback.projection?.flowId}:${playback.scene.stepIndex}:${playback.scene.stepHash}`}
          playback={playback}
        />
      ) : null}
    </div>
  </section>
);
